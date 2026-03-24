#!/usr/bin/env python
import argparse
import json
import threading
import time
import uuid
from pathlib import Path
from urllib import request, error


def post_json(url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode('utf-8')
    req = request.Request(url, data=body, method='POST', headers={'Content-Type': 'application/json'})
    with request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8', errors='ignore'))


def check_health(url: str) -> None:
    req = request.Request(url, method='GET')
    with request.urlopen(req, timeout=10) as resp:
        if resp.status < 200 or resp.status >= 300:
            raise RuntimeError(f'health failed: {resp.status}')


def listen_sse(events_url: str, route_request_id: str, shot_request_id: str, timeout_sec: float):
    state = {'route': None, 'shot': None, 'error': None}
    stop = {'v': False}

    def worker():
        try:
            req = request.Request(events_url, headers={'Accept': 'text/event-stream'})
            with request.urlopen(req, timeout=timeout_sec) as resp:
                event_type = None
                data_buf = []
                while not stop['v']:
                    line = resp.readline()
                    if not line:
                        break
                    s = line.decode('utf-8', errors='ignore').rstrip('\n')
                    if s.startswith('event:'):
                        event_type = s[len('event:'):].strip()
                    elif s.startswith('data:'):
                        data_buf.append(s[len('data:'):].strip())
                    elif s == '':
                        if event_type and data_buf:
                            raw = '\n'.join(data_buf)
                            try:
                                payload = json.loads(raw)
                            except Exception:
                                payload = {'raw': raw}
                            if isinstance(payload, dict):
                                req_id = payload.get('requestId')
                                if req_id == route_request_id and event_type == 'debug-route-result':
                                    state['route'] = payload
                                if req_id == shot_request_id and event_type == 'debug-screenshot-result':
                                    state['shot'] = payload
                                    stop['v'] = True
                                    return
                        event_type = None
                        data_buf = []
        except Exception as ex:
            state['error'] = str(ex)

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return state, stop, t


def compare_images_diff_ratio(before_path: Path, after_path: Path) -> dict:
    try:
        from PIL import Image, ImageChops
    except Exception as ex:
        raise RuntimeError('Pillow 未安装，无法执行视觉差异断言。请先运行: python -m pip install pillow') from ex

    before = Image.open(before_path).convert('RGB')
    after = Image.open(after_path).convert('RGB')

    if before.size != after.size:
        raise RuntimeError(
            f'截图尺寸不一致，无法比较: before={before.size}, after={after.size}'
        )

    diff = ImageChops.difference(before, after)
    bbox = diff.getbbox()
    if bbox is None:
        return {
            'changedPixels': 0,
            'totalPixels': before.size[0] * before.size[1],
            'diffRatio': 0.0,
            'bbox': None,
        }

    nonzero = diff.convert('L').point(lambda x: 255 if x else 0)
    changed_pixels = nonzero.histogram()[255]
    total_pixels = before.size[0] * before.size[1]

    return {
        'changedPixels': int(changed_pixels),
        'totalPixels': int(total_pixels),
        'diffRatio': float(changed_pixels / total_pixels if total_pixels > 0 else 0.0),
        'bbox': [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
    }


def main():
    parser = argparse.ArgumentParser(description='SSE debug loop verifier (route + screenshot)')
    parser.add_argument('--backend', default='http://127.0.0.1:8080')
    parser.add_argument('--page-id', default='section-grid-demo')
    parser.add_argument('--path', default='/t/lmspark/homepage/section-grid-demo')
    parser.add_argument('--selector', default='.section-grid-demo .el-table')
    parser.add_argument('--iterations', type=int, default=2)
    parser.add_argument('--timeout-sec', type=float, default=45.0)
    parser.add_argument('--expect-text', default='')
    parser.add_argument('--assert-visual-change', action='store_true')
    parser.add_argument('--min-diff-ratio', type=float, default=0.0001)
    parser.add_argument('--uploads-dir', default='spark-ai-server/data/uploads')
    args = parser.parse_args()

    backend = args.backend.rstrip('/')
    events_url = f'{backend}/api/events'
    route_url = f'{backend}/api/ai/debug/route-request'
    shot_url = f'{backend}/api/ai/debug/screenshot-request'

    print('[sse-loop-py] health check...')
    check_health(f'{backend}/health')

    records = []

    for i in range(1, args.iterations + 1):
        route_id = f'py-route-{uuid.uuid4()}'
        shot_id = f'py-shot-{uuid.uuid4()}'

        state, stop, thread = listen_sse(events_url, route_id, shot_id, args.timeout_sec)
        time.sleep(1.0)

        refresh_path = f"{args.path}{'&' if '?' in args.path else '?'}refresh={int(time.time()*1000)}-{i}"
        route_ack = post_json(route_url, {
            'requestId': route_id,
            'path': refresh_path,
            'pageId': args.page_id,
            'replace': True,
            'reason': f'verify-sse-loop-py#{i}',
        })

        start = time.time()
        while time.time() - start < args.timeout_sec and state['route'] is None:
            if state['error']:
                break
            time.sleep(0.3)

        if state['route'] is None:
            stop['v'] = True
            raise RuntimeError(f'route result timeout/fail at iter {i}, ack={route_ack}, err={state["error"]}')
        if state['route'].get('status') != 'success':
            stop['v'] = True
            raise RuntimeError(f'route result not success at iter {i}: {json.dumps(state["route"], ensure_ascii=False)}')

        shot_ack = post_json(shot_url, {
            'requestId': shot_id,
            'selector': args.selector,
            'pageId': args.page_id,
            'reason': f'verify-sse-loop-py#{i}',
        })

        start = time.time()
        while time.time() - start < args.timeout_sec and state['shot'] is None:
            if state['error']:
                break
            time.sleep(0.3)

        stop['v'] = True
        if state['shot'] is None:
            raise RuntimeError(f'screenshot result timeout/fail at iter {i}, ack={shot_ack}, err={state["error"]}')
        if state['shot'].get('status') != 'success':
            raise RuntimeError(f'screenshot result not success at iter {i}: {json.dumps(state["shot"], ensure_ascii=False)}')

        digest = state['shot'].get('textDigest') or ''
        if args.expect_text and args.expect_text not in digest:
            raise RuntimeError(f'iter {i} digest missing expect-text={args.expect_text}; digest={digest}')

        record = {
            'iter': i,
            'routeRequestId': route_id,
            'shotRequestId': shot_id,
            'targetPath': state['route'].get('targetPath'),
            'currentPath': state['route'].get('currentPath'),
            'url': state['shot'].get('url'),
            'fileId': state['shot'].get('fileId'),
            'name': state['shot'].get('name'),
        }
        records.append(record)
        print(f"[sse-loop-py] iter {i} ok fileId={record['fileId']}")

    visual_checks = []
    if args.assert_visual_change:
        if len(records) < 2:
            raise RuntimeError('--assert-visual-change 需要 iterations >= 2')

        uploads_dir = Path(args.uploads_dir)
        if not uploads_dir.exists():
            raise RuntimeError(f'uploads 目录不存在: {uploads_dir}')

        for idx in range(1, len(records)):
            before = records[idx - 1]
            after = records[idx]
            before_file_id = before.get('fileId')
            after_file_id = after.get('fileId')
            if not before_file_id or not after_file_id:
                raise RuntimeError(f'第 {idx} 组对比缺少 fileId: before={before_file_id}, after={after_file_id}')

            before_path = uploads_dir / f'{before_file_id}.png'
            after_path = uploads_dir / f'{after_file_id}.png'
            if not before_path.exists() or not after_path.exists():
                raise RuntimeError(f'截图文件不存在: before={before_path.exists()}({before_path}), after={after_path.exists()}({after_path})')

            diff = compare_images_diff_ratio(before_path, after_path)
            check = {
                'pair': [before.get('iter'), after.get('iter')],
                'beforeFileId': before_file_id,
                'afterFileId': after_file_id,
                **diff,
            }
            visual_checks.append(check)

            if check['diffRatio'] < args.min_diff_ratio:
                raise RuntimeError(
                    f"视觉变化断言失败: pair={check['pair']} diffRatio={check['diffRatio']:.8f} < minDiffRatio={args.min_diff_ratio:.8f}"
                )

    print('[sse-loop-py] ✅ done')
    print(json.dumps({
        'ok': True,
        'records': records,
        'visualChecks': visual_checks,
        'assertVisualChange': bool(args.assert_visual_change),
        'minDiffRatio': args.min_diff_ratio,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except error.URLError as ex:
        print('[sse-loop-py] ❌ network error')
        print(str(ex))
        raise SystemExit(1)
    except Exception as ex:
        print('[sse-loop-py] ❌ failed')
        print(str(ex))
        raise SystemExit(1)
