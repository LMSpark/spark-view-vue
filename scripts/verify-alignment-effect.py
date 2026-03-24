#!/usr/bin/env python
"""
对齐效果验证：截图有对齐配置 vs 无对齐配置的页面，对比像素差异。

流程：
1. 截图当前页面（有对齐 CSS class 配置）
2. 通过 PUT API 移除对齐相关属性
3. 截图修改后的页面（无对齐）
4. 恢复原始配置
5. Pillow 像素对比，输出 diffRatio
"""
import json
import threading
import time
import uuid
import sys
from pathlib import Path
from urllib import request
from copy import deepcopy


BACKEND = 'http://127.0.0.1:8080'
TENANT = 'lmspark'
PROJECT = 'homepage'
PAGE_ID = 'section-grid-demo'
SELECTOR = '.section-grid-demo .el-table'
PAGE_PATH = '/t/lmspark/homepage/section-grid-demo'
TIMEOUT = 45.0

EVENTS_URL = f'{BACKEND}/api/events'
ROUTE_URL = f'{BACKEND}/api/ai/debug/route-request'
SHOT_URL = f'{BACKEND}/api/ai/debug/screenshot-request'
RULE_URL = f'{BACKEND}/api/pages-config/{PAGE_ID}/rule.json'
CONTEXT_HEADERS = {'X-Tenant-Id': TENANT, 'X-Project-Id': PROJECT}

ALIGNMENT_KEYS = {'headerCellClassName', 'cellClassName', 'valueClassName', 'titleAlign', 'valueAlign',
                  'header-cell-class-name', 'cell-class-name', 'value-class-name', 'title-align', 'value-align'}


def http_get_json(url, headers=None):
    req = request.Request(url, method='GET', headers=headers or {})
    with request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def http_put_text(url, text, headers=None):
    """PUT 纯文本 content（PageConfig API 接受 text/plain）。"""
    body = text.encode('utf-8')
    h = {'Content-Type': 'text/plain; charset=utf-8'}
    if headers:
        h.update(headers)
    req = request.Request(url, data=body, method='PUT', headers=h)
    with request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def http_post_json(url, payload):
    body = json.dumps(payload).encode('utf-8')
    req = request.Request(url, data=body, method='POST', headers={'Content-Type': 'application/json'})
    with request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def strip_alignment_props(rule):
    """递归移除所有节点 props 中的对齐相关属性。"""
    rule = deepcopy(rule)
    _strip_node(rule if isinstance(rule, list) else [rule])
    return rule


def _strip_node(nodes):
    for node in nodes:
        if not isinstance(node, dict):
            continue
        props = node.get('props')
        if isinstance(props, dict):
            for key in list(props.keys()):
                if key in ALIGNMENT_KEYS:
                    del props[key]
        children = node.get('children')
        if isinstance(children, list):
            _strip_node(children)


def take_screenshot_nav_only(label, iteration, path=None):
    """仅导航到指定路径（不截图）。"""
    route_id = f'align-nav-{uuid.uuid4()}'
    target = path or PAGE_PATH

    state = {'route': None, 'error': None}
    stop = {'v': False}

    def sse_worker():
        try:
            req = request.Request(EVENTS_URL, headers={'Accept': 'text/event-stream'})
            with request.urlopen(req, timeout=TIMEOUT) as resp:
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
                            try:
                                payload = json.loads('\n'.join(data_buf))
                            except Exception:
                                payload = {}
                            if isinstance(payload, dict) and payload.get('requestId') == route_id and event_type == 'debug-route-result':
                                state['route'] = payload
                                stop['v'] = True
                                return
                        event_type = None
                        data_buf = []
        except Exception as ex:
            state['error'] = str(ex)

    t = threading.Thread(target=sse_worker, daemon=True)
    t.start()
    time.sleep(1.0)

    refresh = f"{target}?refresh={int(time.time()*1000)}-{iteration}"
    http_post_json(ROUTE_URL, {
        'requestId': route_id,
        'path': refresh,
        'pageId': PAGE_ID,
        'replace': True,
        'reason': f'verify-alignment-{label}',
    })

    start = time.time()
    while time.time() - start < TIMEOUT and state['route'] is None:
        if state['error']:
            break
        time.sleep(0.3)
    stop['v'] = True
    print(f'  [{label}] nav done')


def take_screenshot(label, iteration):
    """通过 SSE 导航到页面并截图，返回 fileId。"""
    route_id = f'align-route-{uuid.uuid4()}'
    shot_id = f'align-shot-{uuid.uuid4()}'

    state = {'route': None, 'shot': None, 'error': None}
    stop = {'v': False}

    def sse_worker():
        try:
            req = request.Request(EVENTS_URL, headers={'Accept': 'text/event-stream'})
            with request.urlopen(req, timeout=TIMEOUT) as resp:
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
                                payload = {}
                            if isinstance(payload, dict):
                                req_id = payload.get('requestId')
                                if req_id == route_id and event_type == 'debug-route-result':
                                    state['route'] = payload
                                if req_id == shot_id and event_type == 'debug-screenshot-result':
                                    state['shot'] = payload
                                    stop['v'] = True
                                    return
                        event_type = None
                        data_buf = []
        except Exception as ex:
            state['error'] = str(ex)

    t = threading.Thread(target=sse_worker, daemon=True)
    t.start()
    time.sleep(1.0)

    refresh_path = f"{PAGE_PATH}?refresh={int(time.time()*1000)}-{iteration}"
    http_post_json(ROUTE_URL, {
        'requestId': route_id,
        'path': refresh_path,
        'pageId': PAGE_ID,
        'replace': True,
        'reason': f'verify-alignment-{label}',
    })

    start = time.time()
    while time.time() - start < TIMEOUT and state['route'] is None:
        if state['error']:
            break
        time.sleep(0.3)

    if state['route'] is None:
        raise RuntimeError(f'[{label}] route timeout, err={state["error"]}')
    if state['route'].get('status') != 'success':
        raise RuntimeError(f'[{label}] route failed: {state["route"]}')

    time.sleep(1.5)  # 等待页面渲染完成

    http_post_json(SHOT_URL, {
        'requestId': shot_id,
        'selector': SELECTOR,
        'pageId': PAGE_ID,
        'reason': f'verify-alignment-{label}',
    })

    start = time.time()
    while time.time() - start < TIMEOUT and state['shot'] is None:
        if state['error']:
            break
        time.sleep(0.3)

    stop['v'] = True
    if state['shot'] is None:
        raise RuntimeError(f'[{label}] screenshot timeout, err={state["error"]}')
    if state['shot'].get('status') != 'success':
        raise RuntimeError(f'[{label}] screenshot failed: {state["shot"]}')

    file_id = state['shot'].get('fileId')
    print(f'  [{label}] screenshot ok, fileId={file_id}')
    return file_id


def compare_images(file_id_a, file_id_b, uploads_dir):
    from PIL import Image, ImageChops
    path_a = uploads_dir / f'{file_id_a}.png'
    path_b = uploads_dir / f'{file_id_b}.png'
    if not path_a.exists():
        raise RuntimeError(f'截图文件不存在: {path_a}')
    if not path_b.exists():
        raise RuntimeError(f'截图文件不存在: {path_b}')

    img_a = Image.open(path_a).convert('RGB')
    img_b = Image.open(path_b).convert('RGB')

    if img_a.size != img_b.size:
        print(f'  ⚠️ 截图尺寸不同: A={img_a.size}, B={img_b.size}')
        return 1.0  # 尺寸不同视为有差异

    diff = ImageChops.difference(img_a, img_b)
    bbox = diff.getbbox()
    if bbox is None:
        return 0.0

    nonzero = diff.convert('L').point(lambda x: 255 if x else 0)
    changed = nonzero.histogram()[255]
    total = img_a.size[0] * img_a.size[1]
    return changed / total if total > 0 else 0.0


def main():
    uploads_dir = Path('spark-ai-server/data/uploads')

    print('=== 对齐效果验证 ===')
    print()

    # Step 1: 读取当前 rule.json
    # Step 1: 读取当前 rule.json（后端返回 {"content": "<json_string>"} ）
    print('Step 1: 读取当前 rule.json ...')
    resp = http_get_json(RULE_URL, CONTEXT_HEADERS)
    original_content_str = resp.get('content', '') if isinstance(resp, dict) else ''
    original_rule = json.loads(original_content_str)
    # 验证对齐属性存在
    found_align = False
    def _check(nodes):
        nonlocal found_align
        for n in (nodes if isinstance(nodes, list) else [nodes]):
            if isinstance(n, dict):
                p = n.get('props', {})
                if any(k in p for k in ALIGNMENT_KEYS):
                    found_align = True
                _check(n.get('children', []))
    _check(original_rule)
    print(f'  读取成功，含对齐属性={found_align}')

    # Step 2: 截图当前状态（有对齐配置）
    print('Step 2: 截图有对齐配置的页面 ...')
    file_id_with = take_screenshot('WITH-ALIGN', 1)

    # Step 3: 生成无对齐的 rule.json 并写入
    print('Step 3: 移除对齐属性并写入 ...')
    stripped_rule = strip_alignment_props(original_rule)
    stripped_text = json.dumps(stripped_rule, indent=2, ensure_ascii=False)
    http_put_text(RULE_URL, stripped_text, CONTEXT_HEADERS)
    print('  已写入无对齐配置')

    time.sleep(2.0)  # 等待写入完成

    # Step 3.5: 导航离开再回来，确保页面重新加载配置
    print('Step 3.5: 导航离开再回来 ...')
    take_screenshot_nav_only('AWAY', 3, '/t/lmspark/homepage')
    time.sleep(1.5)

    # Step 4: 截图修改后的页面（无对齐配置）
    print('Step 4: 截图无对齐配置的页面 ...')
    file_id_without = take_screenshot('NO-ALIGN', 4)

    # Step 5: 恢复原始 rule.json
    print('Step 5: 恢复原始 rule.json ...')
    http_put_text(RULE_URL, original_content_str, CONTEXT_HEADERS)
    # 验证恢复
    resp2 = http_get_json(RULE_URL, CONTEXT_HEADERS)
    restored = resp2.get('content', '')
    if 'headerCellClassName' in restored:
        print('  ✅ 恢复成功（含对齐属性）')
    else:
        print('  ⚠️ 恢复后未检测到对齐属性！')

    # Step 6: 对比
    print('Step 6: 像素对比 ...')
    diff_ratio = compare_images(file_id_with, file_id_without, uploads_dir)
    print()
    print(f'  📊 diffRatio = {diff_ratio:.8f}')
    print(f'  fileId_WITH  = {file_id_with}')
    print(f'  fileId_WITHOUT = {file_id_without}')
    print()

    if diff_ratio > 0.0001:
        print('  ✅ 对齐配置产生了可见的视觉差异！')
        sys.exit(0)
    else:
        print('  ❌ 对齐配置没有产生可见差异（diffRatio 过小）')
        sys.exit(1)


if __name__ == '__main__':
    main()
