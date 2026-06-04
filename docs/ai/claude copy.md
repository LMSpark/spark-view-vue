Agent OS · OpenAI 协议落地方案
把上一版的「自定义 Command 结构」全部改写为 OpenAI Chat Completions / Function Calling（Tools）协议。 核心原则不变：注解是唯一来源 · Contract 只是 Tool Schema 的投影 · execute() 统一收口。

〇、协议映射总表（旧 → OpenAI）
上一版自定义结构	OpenAI 协议对应	说明
Capability	tools[].function	每个能力 = 一个 function
Capability.argsSchema	function.parameters (JSON Schema)	直接复用
Command{capability,target,args}	tool_calls[].function.{name,arguments}	LLM 输出
召回 top-k 能力	动态注入 tools 数组	永不全量
执行结果	role:"tool" message	回灌给模型
多步 Planner	多轮 tool_calls 循环	模型自驱动
危险操作确认	二次 tool_call + confirmed=true	网关回填
结论：不需要任何私有协议。一切用 OpenAI tools 表达即可。

一、能力 → OpenAI Tool（编译产物）
注解编译器的输出从「私有 Capability JSON」改为「标准 Tool 定义」。

{
  "type": "function",
  "function": {
    "name": "person_education_create",
    "description": "给某人新增一段教育经历。例如:给张三加一段学历、添加教育经历",
    "parameters": {
      "type": "object",
      "properties": {
        "target_path": {
          "type": "string",
          "description": "目标父实例的自然键路径,如 Person[@name=张三]/Resume[1]。系统据此定位,LLM不要编造ID"
        },
        "school": { "type": "string", "description": "毕业学校" },
        "major":  { "type": "string", "description": "专业" },
        "period": { "type": "string", "description": "起止时间,如2015-2019" }
      },
      "required": ["target_path", "school", "major"]
    }
  }
}
命名约定（把层级压进 function name，OpenAI 只允许 ^[a-zA-Z0-9_-]+$）：

{domain}_{model}_{effect}        person_education_create
{domain}_{model}_{action}        order_approve
执行所需的元信息（effect / permission / reversible / confirmPolicy）不进 Schema，存在服务端 Registry，按 name 反查。LLM 不需要知道这些。

二、注解 → Tool 编译器（改写）
@Component
public class ToolCompiler {

    List<ChatTool> compile() {
        List<ChatTool> tools = new ArrayList<>();
        for (Class<?> m : scan(Model.class)) {
            tools.add(crudTool(m, CREATE));
            tools.add(crudTool(m, UPDATE));
            tools.add(crudTool(m, DELETE));
            tools.add(crudTool(m, QUERY));
        }
        for (Method a : scan(Action.class)) {
            tools.add(actionTool(a));
        }
        registry.publish(tools);   // 同时存 name→执行元信息
        return tools;
    }

    ChatTool crudTool(Class<?> model, Effect effect) {
        Model meta = model.getAnnotation(Model.class);
        String name = "%s_%s".formatted(meta.code(), effect.name().toLowerCase());

        ObjectSchema params = new ObjectSchema();
        params.addProperty("target_path", string(
            "目标实例自然键路径,如 " + meta.pathExample() + ",由系统解析,勿编ID"));

        if (effect == CREATE || effect == UPDATE) {
            for (Field f : fieldsOf(model)) {
                params.addProperty(f.code(), string(f.desc()));
                if (f.required() && effect == CREATE) params.require(f.code());
            }
        }
        params.require("target_path");

        return ChatTool.function(name, descOf(meta), params);
    }
}
三、召回 → 动态注入 tools（OpenAI 调用形态）
public ChatCompletionRequest buildRequest(String userMsg, List<ChatMessage> history, Context ctx) {

    // 1. 权限+域裁剪 → 向量召回 topK，绝不全量
    List<ChatTool> tools = recall(userMsg, ctx, /*topK*/ 8);

    return ChatCompletionRequest.builder()
        .model("gpt-4.1")
        .messages(withSystemPrompt(history, userMsg))
        .tools(tools)                       // ← 动态注入的候选能力
        .toolChoice("auto")
        .parallelToolCalls(true)            // 允许一次多动作
        .build();
}
System Prompt（关键约束写死）：

你是企业平台操作助手。
- 通过提供的工具完成用户请求。
- target_path 用自然键路径表达,如 Order[@no=1001]/Package[2],绝不编造数字ID。
- 信息不足时,先用 *_query 工具查询确认,再执行写操作。
- 删除/审批等高风险操作,直接调用即可,系统会拦截并要求用户确认。
四、tool_calls 执行循环（OpenAI 标准多轮）
public ChatResult run(String userMsg, Session session) {
    var messages = session.history();
    messages.add(userMessage(userMsg));

    while (true) {
        var req  = buildRequest(messages, session.ctx());
        var resp = openai.chat(req);
        var msg  = resp.choices().get(0).message();
        messages.add(msg);

        if (msg.toolCalls() == null) {        // 模型给出自然语言回复 → 结束
            return ChatResult.finalAnswer(msg.content());
        }

        // 执行每个 tool_call,结果以 role:"tool" 回灌
        for (ToolCall call : msg.toolCalls()) {
            ToolMessage out = executeToolCall(call, session.ctx());
            messages.add(out);
            if (out.needUserAction()) {       // 需确认/需澄清 → 暂停交还前端
                return ChatResult.pending(out);
            }
        }
        // 回灌后继续 while,让模型决定下一步或收尾
    }
}
executeToolCall —— 把 OpenAI 的 tool_call 接到上一版的 CommandExecutor 咽喉：

ToolMessage executeToolCall(ToolCall call, Context ctx) {
    String name = call.function().name();
    Map<String,Object> args = json.parse(call.function().arguments());

    // 1. name → 执行元信息(effect/permission/reversible/handler)
    Capability cap = registry.byToolName(name);

    // 2. 权限(复用操作码)
    permissionService.check(ctx.user(), cap.permission());

    // 3. 定位:target_path → id
    var target = resolver.resolve((String) args.get("target_path"), ctx);
    if (target.ambiguous())
        return tool(call, json(Map.of(
            "status","need_clarify",
            "message","定位到多个实例,请补充",
            "candidates", target.candidates())));   // 模型会据此追问用户

    // 4. 危险操作确认网关
    Footprint fp = estimate(cap, target);
    boolean confirmed = Boolean.TRUE.equals(args.get("confirmed"));
    if (cap.needConfirm(fp) && !confirmed)
        return tool(call, json(Map.of(
            "status","need_confirm",
            "message","该操作将影响 "+fp.count()+" 条记录,确认请回复确认",
            "footprint", fp)));                      // 前端弹确认,确认后带 confirmed=true 重发

    // 5. 进事务执行(复用 VCM.Context + Journal 回滚 + Audit)
    Object result = ctx.tx(() -> {
        Object before = cap.reversible() ? snapshot(target) : null;
        Object r = dispatch(cap, target, args, ctx);
        journal.record(name, args, before, cap.effect());
        audit.log(ctx.user(), name, args, r);
        return r;
    });

    return tool(call, json(Map.of("status","ok","result", result)));
}
要点：OpenAI 协议只负责「模型 ↔ 工具」的对话编排；真正的权限/事务/回滚/审计仍在 execute() 咽喉里，一行没丢。

五、三类典型场景（OpenAI 报文实录）
场景1：新增（一次成功）
// 模型输出
{ "role":"assistant", "tool_calls":[{
  "id":"call_1","type":"function",
  "function":{
    "name":"education_create",
    "arguments":"{\"target_path\":\"Person[@name=张三]/Resume[1]\",\"school\":\"武汉大学\",\"major\":\"软件工程\",\"period\":\"2015-2019\"}"
  }}]}

// 系统回灌
{ "role":"tool","tool_call_id":"call_1",
  "content":"{\"status\":\"ok\",\"result\":{\"id\":\"edu_888\"}}" }

// 模型收尾
{ "role":"assistant","content":"已为张三新增教育经历:武汉大学 软件工程 (2015-2019)。" }
场景2：删除（先确认）
// 第1轮:模型调用删除
{ "role":"assistant","tool_calls":[{ "id":"call_9","type":"function",
  "function":{"name":"logistics_delete",
    "arguments":"{\"target_path\":\"Order[@no=1001]/Package[2]/Logistics[3]\"}"}}]}

// 系统拦截:需确认
{ "role":"tool","tool_call_id":"call_9",
  "content":"{\"status\":\"need_confirm\",\"message\":\"将删除1条物流记录,确认?\",\"footprint\":{\"count\":1}}" }

// 模型转告用户
{ "role":"assistant","content":"将删除订单1001包裹2的物流记录3,确认请回复\"确认\"。" }

// 用户"确认" → 模型重发(带 confirmed)
{ "role":"assistant","tool_calls":[{ "id":"call_10","type":"function",
  "function":{"name":"logistics_delete",
    "arguments":"{\"target_path\":\"Order[@no=1001]/Package[2]/Logistics[3]\",\"confirmed\":true}"}}]}

// 执行成功
{ "role":"tool","tool_call_id":"call_10","content":"{\"status\":\"ok\"}" }
场景3：多步（parallel_tool_calls）
// 用户:给张三建履历,教育填武大,工作填腾讯
// 模型一次产出多个调用(或分轮),系统逐个回灌
{ "role":"assistant","tool_calls":[
  {"id":"c1","type":"function","function":{"name":"resume_create",
     "arguments":"{\"target_path\":\"Person[@name=张三]\"}"}},
  {"id":"c2","type":"function","function":{"name":"education_create",
     "arguments":"{\"target_path\":\"Person[@name=张三]/Resume[last]\",\"school\":\"武汉大学\",\"major\":\"软件工程\"}"}},
  {"id":"c3","type":"function","function":{"name":"work_create",
     "arguments":"{\"target_path\":\"Person[@name=张三]/Resume[last]\",\"company\":\"腾讯\"}"}}
]}
// 三个 tool 结果分别回灌 → 模型收尾报告
六、MCP 兼容（P4 一行桥接）
OpenAI tools 与 MCP tools Schema 同构，编译器多出一个 export 即可：

// 同一份 Tool 定义,两个出口
McpServer.expose(registry.allTools());        // MCP: tools/list + tools/call
// tools/call → 复用同一个 executeToolCall()
MCP 的 tools/call 和 OpenAI 的 tool_calls 共用同一个执行咽喉,零重复逻辑。

七、四阶段（OpenAI 版交付）
阶段	OpenAI 维度新增	上线产物
P1	ToolCompiler + executeToolCall + 单轮	「审批订单1001」能跑
P2	动态 recall 注入 tools(topK)	几千能力选对 + 路径定位
P3	tool_calls 多轮循环 + 确认网关 + Journal	多步任务 + 回滚
P4	MCP export + 领域 Agent	跨系统协作
八、相对自定义协议的得失
收益

零私有协议，任何支持 OpenAI 的客户端/SDK/网关即插即用。
tools 动态注入天然适配「召回 topK」。
role:"tool" 回灌让 need_clarify / need_confirm 自然变成对话轮次，无需额外状态机。
与 MCP 同构，P4 几乎免费。
约束（务必守住）

function name 受限 ^[a-zA-Z0-9_-]+$ 且总长有限 → 用 domain_model_effect 压平，禁止中文/斜杠。
单请求 tools 数量影响 token 与命中率 → topK≤8 是硬约束，靠 recall 不靠堆量。
执行语义(权限/事务/回滚)绝不放进 Schema，全部留在服务端 Registry + execute()。
LLM 仍只产 target_path，不产 ID。
九、第一阶段任务清单（OpenAI 版，可直接派工）
#	任务	产出
1	ToolCompiler：@Model→CRUD tools、@Action→action tool	标准 Tool 库
2	Registry：name→{effect,permission,reversible,handler}	执行元信息表
3	recall()：权限+域裁剪→向量召回 topK→注入 tools	动态 tools
4	PathResolver：[@field=v]/[n] 路径解析	实例定位
5	executeToolCall()：接 CommandExecutor 咽喉	执行收口
6	多轮 run() 循环 + need_confirm/need_clarify 回灌	对话编排
7	Journal 回滚 + ConfirmGateway 接 PageDesign	安全网
8	一个 demo：审批/新增/删除三场景跑通	可演示 Copilot
一句话收尾
不发明协议——把每个注解编译成一个 OpenAI function，把权限/事务/回滚/审计全部焊在 executeToolCall() 咽喉里，用标准 tool_calls 多轮循环驱动模型。这样既拿到 OpenAI/MCP 生态的全部红利，又一行不丢企业级执行语义。

要我把 任务 #1 ToolCompiler 和 #5 executeToolCall 展开成带单元测试的完整代码骨架吗？那是周一可直接 git commit 的东西。

我需要更加详细的方案交给团队
模型图标
claude-opus-4-8
Agent OS 落地交付方案（OpenAI 协议）
团队执行版 · 可直接拆分为 Sprint Backlog
文档定位：本文是给研发团队的工程交付文档，不是架构理论。 每一节都给到：接口契约 / 代码骨架 / 数据结构 / 测试用例 / 验收标准 / 工时。 核心铁律：注解是唯一来源 · Tool 是注解的投影 · execute() 是唯一执行咽喉 · LLM 只产 path 不产 ID。

目录
第0章  范围与不做清单
第1章  总体架构与模块边界
第2章  数据结构契约（全量）
第3章  模块1：ToolCompiler（注解→Tool）
第4章  模块2：CapabilityRegistry（执行元信息）
第5章  模块3：Recall（动态 tools 召回）
第6章  模块4：PathResolver（实例定位）
第7章  模块5：ConversationOrchestrator（多轮循环）
第8章  模块6：ToolCallExecutor（执行咽喉）
第9章  模块7：ConfirmGateway / Journal / Audit（安全网）
第10章 MCP 兼容层
第11章 接口清单（REST + 内部 SPI）
第12章 测试策略与用例矩阵
第13章 部署与配置
第14章 Sprint 计划与人力分配
第15章 风险登记册
第16章 验收标准（Definition of Done）
第0章 范围与不做清单
0.1 本期做（P1+P2）
编号	能力	说明
F1	注解自动编译成 OpenAI Tool	@Model/@Action → tools
F2	动态召回 topK tools	不全量注入
F3	自然键路径定位实例	Order[@no=1001]/Package[2]
F4	CRUD + Action 执行	收口到 execute()
F5	多轮 tool_calls 编排	need_clarify / need_confirm
F6	权限校验复用现有操作码	一行不改权限体系
F7	写操作 Journal + Audit	可回滚可追溯
0.2 本期明确不做（防止范围蔓延）
不做项	原因	何时做
多 Agent 编排（Agent Tree）	单 Agent 未稳前不碰	P4
MCP Server 对外开放	留接口不开服务	P4
跨系统调用	先把本系统跑顺	P4
自然语言生成报表/图表	与实例操作无关	另立项
模型结构由 LLM 自由探索	风险高、不可控	永不做，改为受控召回
自动建模（LLM 改元数据）	极高危	永不做
写进文档的目的：任何人想往本期塞功能，先来这张表对线。

第1章 总体架构与模块边界
1.1 分层架构图
┌────────────────────────────────────────────────────────────┐
│                      前端 / Copilot UI                       │
│         （聊天框 + 确认弹窗 + 澄清追问 + 结果卡片）             │
└───────────────┬────────────────────────────────────────────┘
                │ REST: POST /agent/chat
┌───────────────▼────────────────────────────────────────────┐
│                  ConversationOrchestrator  (模块5)           │
│   多轮循环：组装请求 → 调LLM → 解析 tool_calls → 回灌         │
└───┬───────────────────────┬────────────────────────┬────────┘
    │ buildRequest          │ executeToolCall        │
┌───▼──────────┐  ┌─────────▼──────────┐   ┌─────────▼────────┐
│ Recall (模块3)│  │ ToolCallExecutor   │   │  OpenAI Client    │
│ topK tools   │  │      (模块6)        │   │  (LLM Gateway)    │
└───┬──────────┘  └───┬────────┬───────┘   └───────────────────┘
    │                 │        │
┌───▼──────────┐  ┌───▼───┐ ┌──▼──────────────┐
│CapabilityReg │  │PathRes│ │ConfirmGateway   │
│   (模块4)     │  │(模块4)│ │Journal/Audit(模7)│
└───┬──────────┘  └───────┘ └──┬──────────────┘
    │ 启动时编译                 │ 复用现有
┌───▼──────────┐               ┌▼──────────────────────────────┐
│ToolCompiler  │               │ 现有平台：VCM / 权限 / 事务 /  │
│   (模块1)     │◄──扫描注解────│ @Model @Action @Permission     │
└──────────────┘               └────────────────────────────────┘
1.2 模块责任边界（防止扯皮）
模块	唯一职责	绝不做
ToolCompiler	注解→Tool Schema	不执行、不召回
CapabilityRegistry	name→执行元信息查询	不做权限判断
Recall	选出 topK 候选 tools	不执行
PathResolver	path→instanceId	不做权限、不写库
Orchestrator	多轮对话编排	不碰业务逻辑
ToolCallExecutor	收口执行（权限+事务+回滚+审计）	不召回、不对话
ConfirmGateway	危险操作拦截	不执行
铁律：跨模块只能通过下面第2章定义的 DTO 通信，禁止互相 import 实现类。

第2章 数据结构契约（全量）
这是团队的通信宪法。所有模块按此对接，先冻结这章再写代码。

2.1 Tool（编译产物，OpenAI 标准）
public record ToolDef(
    String type,                 // 固定 "function"
    FunctionDef function
) {}

public record FunctionDef(
    String name,                 // person_education_create，^[a-z0-9_]+$，≤64
    String description,          // 含同义词，供 LLM 命中
    JsonNode parameters          // JSON Schema (type:object)
) {}
2.2 Capability（执行元信息，服务端私有，不给 LLM）
public record Capability(
    String toolName,             // 与 FunctionDef.name 一一对应
    String domain,               // person / order，用于域裁剪
    String modelCode,            // education
    Effect effect,               // CREATE/UPDATE/DELETE/QUERY/ACTION
    String permissionCode,       // 复用现有操作码，如 PERSON_EDU_CREATE
    boolean reversible,          // 是否可回滚（决定是否快照）
    ConfirmPolicy confirmPolicy, // NEVER / ALWAYS / THRESHOLD
    int confirmThreshold,        // THRESHOLD 时的影响行数阈值
    HandlerRef handler           // 指向真正执行的 bean+method
) {}

public enum Effect { CREATE, UPDATE, DELETE, QUERY, ACTION }
public enum ConfirmPolicy { NEVER, ALWAYS, THRESHOLD }

public record HandlerRef(String beanName, String methodName, Class<?> argType) {}
2.3 ToolCallResult（回灌给 LLM 的统一结构）
public record ToolCallResult(
    String toolCallId,
    Status status,               // OK / NEED_CLARIFY / NEED_CONFIRM / ERROR
    Object result,               // OK 时的业务结果
    String message,              // 给用户/模型的提示
    List<Candidate> candidates,  // NEED_CLARIFY 时的候选实例
    Footprint footprint          // NEED_CONFIRM 时的影响面
) {
    public enum Status { OK, NEED_CLARIFY, NEED_CONFIRM, ERROR }
}

public record Candidate(String instanceId, String label, String path) {}
public record Footprint(int affectedCount, List<String> sampleIds) {}
2.4 ChatRequest / ChatResponse（前端 ↔ 后端）
// 前端请求
public record ChatRequest(
    String sessionId,
    String userMessage,
    boolean userConfirmed        // 用户点了"确认"按钮时为 true
) {}

// 后端响应
public record ChatResponse(
    String sessionId,
    Phase phase,                 // ANSWER / PENDING_CONFIRM / PENDING_CLARIFY
    String content,              // 给用户看的自然语言
    PendingAction pending        // 需要前端弹窗时的结构化数据
) {
    public enum Phase { ANSWER, PENDING_CONFIRM, PENDING_CLARIFY }
}

public record PendingAction(
    String type,                 // confirm / clarify
    String prompt,
    Footprint footprint,
    List<Candidate> candidates
) {}
2.5 内部对话消息（OpenAI 标准 message）
public sealed interface ChatMessage {}
public record SystemMessage(String content) implements ChatMessage {}
public record UserMessage(String content) implements ChatMessage {}
public record AssistantMessage(String content, List<ToolCall> toolCalls) implements ChatMessage {}
public record ToolMessage(String toolCallId, String content) implements ChatMessage {}

public record ToolCall(String id, String type, FunctionCall function) {}
public record FunctionCall(String name, String arguments /*JSON字符串*/) {}
第3章 模块1：ToolCompiler（注解 → Tool）
3.1 职责
平台启动时扫描所有 @Model / @Action，编译成 ToolDef 列表 + Capability 列表，写入 Registry。

3.2 命名规约（冻结，全员遵守）
CRUD：  {modelCode}_{create|update|delete|query}
        person_create / education_update / logistics_delete
Action: {modelCode}_{actionCode}
        order_approve / ticket_close
约束：  全小写、下划线分隔、≤64字符、^[a-z0-9_]+$
冲突：  同名报错，启动失败（fail-fast）
3.3 参数 Schema 生成规则
注解字段类型	JSON Schema	备注
String	{"type":"string"}	带 description
Integer/Long	{"type":"integer"}	
BigDecimal/Double	{"type":"number"}	
Boolean	{"type":"boolean"}	
Enum	{"type":"string","enum":[...]}	枚举值列出
Date/DateTime	{"type":"string","format":"date"}	
关系字段（@Ref）	不进 Schema	用 target_path 表达
强制注入字段：

target_path  (必填)  —— 所有 CRUD/Action 都有
confirmed    (可选)  —— 仅 DELETE 及高危 Action 注入
3.4 代码骨架
@Component
@RequiredArgsConstructor
public class ToolCompiler {

    private final CapabilityRegistry registry;
    private final MetadataService metadata;   // 现有平台元数据服务

    @PostConstruct
    public void compileAll() {
        List<ToolDef> tools = new ArrayList<>();
        List<Capability> caps = new ArrayList<>();

        for (ModelMeta model : metadata.allModels()) {
            for (Effect effect : List.of(CREATE, UPDATE, DELETE, QUERY)) {
                Compiled c = compileCrud(model, effect);
                tools.add(c.tool());
                caps.add(c.capability());
            }
        }
        for (ActionMeta action : metadata.allActions()) {
            Compiled c = compileAction(action);
            tools.add(c.tool());
            caps.add(c.capability());
        }

        validateNoDuplicate(tools);   // fail-fast
        registry.publish(tools, caps);
        log.info("ToolCompiler: {} tools compiled", tools.size());
    }

    private Compiled compileCrud(ModelMeta model, Effect effect) {
        String name = model.code() + "_" + effect.name().toLowerCase();

        ObjectNode params = JsonNodeFactory.instance.objectNode();
        params.put("type", "object");
        ObjectNode props = params.putObject("properties");
        ArrayNode required = params.putArray("required");

        // 1. 强制 target_path
        props.set("target_path", stringSchema(
            "目标父实例的自然键路径，如 " + model.pathExample()
            + "。系统据此定位，请勿编造数字ID"));
        required.add("target_path");

        // 2. 业务字段（仅 CREATE/UPDATE）
        if (effect == CREATE || effect == UPDATE) {
            for (FieldMeta f : model.fields()) {
                if (f.isRelation()) continue;          // 关系不进 schema
                props.set(f.code(), fieldSchema(f));
                if (f.required() && effect == CREATE) required.add(f.code());
            }
        }

        // 3. 高危注入 confirmed
        if (effect == DELETE) {
            props.set("confirmed", boolSchema("用户已确认删除时为true"));
        }

        ToolDef tool = new ToolDef("function",
            new FunctionDef(name, buildDescription(model, effect), params));

        Capability cap = new Capability(
            name, model.domain(), model.code(), effect,
            model.permissionCode(effect),
            effect != DELETE,                          // delete 不可回滚？按需
            effect == DELETE ? ConfirmPolicy.ALWAYS : ConfirmPolicy.NEVER,
            0,
            model.crudHandler(effect));

        return new Compiled(tool, cap);
    }

    private String buildDescription(ModelMeta m, Effect e) {
        // 关键：把同义词写进 description，提升召回与命中
        return switch (e) {
            case CREATE -> "新增一条%s。例如：添加%s、新建%s、录入%s"
                .formatted(m.name(), m.name(), m.name(), m.name());
            case UPDATE -> "修改%s。例如：更新%s、编辑%s、改%s"
                .formatted(m.name(), m.name(), m.name(), m.name());
            case DELETE -> "删除%s。例如：移除%s、删掉%s"
                .formatted(m.name(), m.name(), m.name());
            case QUERY  -> "查询%s。例如：查%s、看%s、列出%s"
                .formatted(m.name(), m.name(), m.name(), m.name());
            default -> m.name();
        };
    }
}
3.5 测试用例
用例	输入	期望
TC-COMP-01	@Model education(必填school)	生成 education_create，required含 target_path,school
TC-COMP-02	同 modelCode 重复	启动抛 DuplicateToolException
TC-COMP-03	含枚举字段	schema 带 enum 数组
TC-COMP-04	关系字段	不出现在 properties
TC-COMP-05	delete 工具	properties 含 confirmed
3.6 验收标准
[ ] 全平台模型编译零报错启动
[ ] 生成的 tool name 全部符合正则
[ ] 抽查 10 个 tool，schema 与注解一致
[ ] 编译耗时 < 2s（5000 模型内）
工时：3 人日

第4章 模块2：CapabilityRegistry
4.1 职责
存储 ToolDef（给 Recall 用）
存储 Capability（给 Executor 用）
提供 byToolName(name) 快速反查
提供向量索引数据（description embedding）
4.2 代码骨架
@Component
public class CapabilityRegistry {

    private final Map<String, ToolDef> toolMap = new ConcurrentHashMap<>();
    private final Map<String, Capability> capMap = new ConcurrentHashMap<>();
    private final EmbeddingStore embeddingStore;   // 向量库（pgvector/Milvus）

    public void publish(List<ToolDef> tools, List<Capability> caps) {
        tools.forEach(t -> toolMap.put(t.function().name(), t));
        caps.forEach(c -> capMap.put(c.toolName(), c));
        rebuildEmbeddings(tools);   // 把 description 向量化入库
    }

    public ToolDef tool(String name) { return toolMap.get(name); }

    public Capability capability(String name) {
        Capability c = capMap.get(name);
        if (c == null) throw new UnknownToolException(name);
        return c;
    }

    public List<String> semanticSearch(String query, int topK, Set<String> domainFilter) {
        return embeddingStore.search(query, topK * 3).stream()
            .filter(hit -> domainFilter.isEmpty()
                        || domainFilter.contains(capMap.get(hit).domain()))
            .limit(topK)
            .toList();
    }
}
4.3 验收标准
[ ] byToolName O(1)
[ ] 未知 name 抛 UnknownToolException
[ ] 向量检索 P99 < 50ms
工时：2 人日

第5章 模块3：Recall（动态 tools 召回）
5.1 为什么必须召回（写给团队）
平台有几千上万个能力。不可能把全部 tools 塞进一次 LLM 请求： ① token 爆炸 ② 命中率暴跌 ③ 费用飙升。 硬指标：单次注入 tools ≤ 8 个。 靠召回精度，不靠数量。

5.2 召回流水线
用户输入
  ↓
① 权限裁剪：去掉无操作码权限的能力        ← 复用现有权限体系
  ↓
② 域裁剪：根据会话上下文锁定 domain        ← 如当前在"订单模块"
  ↓
③ 向量召回：description embedding top 24
  ↓
④ 重排：BM25关键词 + effect匹配 加权
  ↓
⑤ 截断 topK=8
  ↓
注入 ChatRequest.tools
5.3 代码骨架
@Component
@RequiredArgsConstructor
public class Recall {

    private final CapabilityRegistry registry;
    private final PermissionService permission;

    public List<ToolDef> recall(String userMsg, Context ctx, int topK) {
        // ① 语义召回（带域过滤）
        List<String> candidates = registry.semanticSearch(
            userMsg, topK * 3, ctx.activeDomains());

        // ② 权限裁剪
        candidates = candidates.stream()
            .filter(name -> permission.has(ctx.user(),
                    registry.capability(name).permissionCode()))
            .toList();

        // ③ 重排
        candidates = rerank(userMsg, candidates);

        // ④ 截断 + 取 ToolDef
        return candidates.stream()
            .limit(topK)
            .map(registry::tool)
            .toList();
    }
}
5.4 召回质量保障
措施	说明
离线评测集	准备 200 条「用户话术→应命中能力」标注集
召回率指标	Recall@8 ≥ 95% 才上线
兜底	召回为空时，注入该域 CRUD 4 个 + query
日志	每次召回记录 query / 命中 / 是否被选用 → 持续优化
5.5 验收标准
[ ] Recall@8 ≥ 95%（评测集）
[ ] 单次注入 ≤ 8
[ ] 召回 P99 < 100ms
[ ] 无权限能力 100% 被过滤
工时：5 人日（含评测集构建）

第6章 模块4：PathResolver（实例定位）
6.1 路径语法（冻结）
段语法：   ModelCode[selector]
selector： @field=value    自然键定位   Person[@name=张三]
          n               序号定位     Resume[1]（从1开始）
          last            最后一个     Resume[last]
          @field=v,@f2=v2  多条件      Project[@name=A,@status=ing]

完整示例： Order[@no=1001]/Package[2]/Logistics[3]
          Person[@name=张三]/Resume[1]/Education[last]
6.2 解析结果
public record ResolveResult(
    ResolveStatus status,        // UNIQUE / AMBIGUOUS / NOT_FOUND
    String instanceId,           // UNIQUE 时
    String parentInstanceId,     // 用于 CREATE 时挂载
    List<Candidate> candidates   // AMBIGUOUS 时
) {
    public enum ResolveStatus { UNIQUE, AMBIGUOUS, NOT_FOUND }
}
6.3 代码骨架
@Component
@RequiredArgsConstructor
public class PathResolver {

    private final InstanceQueryService query;   // 复用现有数据访问

    public ResolveResult resolve(String path, Effect effect, Context ctx) {
        List<PathSegment> segments = parse(path);

        String currentId = null;          // 根从 null 开始
        String parentId = null;

        for (int i = 0; i < segments.size(); i++) {
            PathSegment seg = segments.get(i);
            boolean isLast = (i == segments.size() - 1);

            // CREATE：最后一段是要新建的目标，定位到其父即可
            if (effect == CREATE && isLast) {
                return new ResolveResult(UNIQUE, null, currentId, null);
            }

            List<String> matched = query.find(
                seg.modelCode(), seg.selector(), currentId, ctx);

            if (matched.isEmpty())
                return new ResolveResult(NOT_FOUND, null, null, null);

            if (matched.size() > 1 && isLast)
                return new ResolveResult(AMBIGUOUS, null, null,
                    toCandidates(matched, seg.modelCode()));

            parentId = currentId;
            currentId = matched.get(0);   // 多个取第一（非末段，按业务可调）
        }
        return new ResolveResult(UNIQUE, currentId, parentId, null);
    }
}
6.4 测试用例
用例	path	数据	期望
TC-PATH-01	Person[@name=张三]	唯一	UNIQUE
TC-PATH-02	Person[@name=张三]	2个张三	AMBIGUOUS, 2候选
TC-PATH-03	Order[@no=999]	不存在	NOT_FOUND
TC-PATH-04	Person[@name=张三]/Resume[1]	有履历	UNIQUE, parentId=person
TC-PATH-05	.../Education (create末段)	—	UNIQUE, instanceId=null, parentId=resume
TC-PATH-06	Resume[last]	3段履历	命中第3段
6.5 验收标准
[ ] 6 类 selector 全支持
[ ] AMBIGUOUS 返回可读 label 候选
[ ] CREATE 正确返回父 id
[ ] 解析非法 path 抛明确异常
工时：5 人日

第7章 模块5：ConversationOrchestrator（多轮循环）
7.1 状态机
            ┌─────────────────────────────────────────┐
            ▼                                          │
[收到用户消息] → [组装请求(注入tools)] → [调用LLM]      │
            │                                  │       │
            │              ┌───────────────────┤       │
            │              ▼                   ▼        │
       [无tool_calls]  [有tool_calls]                  │
            │              │                            │
            ▼              ▼                            │
       [返回ANSWER]   [逐个执行tool_call]               │
                           │                            │
            ┌──────────────┼──────────────┐             │
            ▼              ▼              ▼             │
          [OK]    [NEED_CONFIRM]   [NEED_CLARIFY]       │
            │              │              │             │
       [回灌结果]    [返回PENDING]   [返回PENDING]       │
            │       (前端弹确认)    (前端追问)           │
            └──────────────────────────────────────────┘
                  (回灌后继续循环，由LLM决定下一步)
7.2 代码骨架
@Service
@RequiredArgsConstructor
public class ConversationOrchestrator {

    private final SessionStore sessions;
    private final Recall recall;
    private final OpenAiClient openai;
    private final ToolCallExecutor executor;

    private static final int MAX_TURNS = 6;   // 防死循环硬上限

    public ChatResponse chat(ChatRequest req) {
        Session session = sessions.load(req.sessionId());
        session.addUser(req.userMessage());

        for (int turn = 0; turn < MAX_TURNS; turn++) {

            // 1. 召回 + 组装
            List<ToolDef> tools = recall.recall(
                req.userMessage(), session.context(), 8);

            ChatCompletionRequest llmReq = ChatCompletionRequest.builder()
                .model("gpt-4.1")
                .messages(session.messages())
                .tools(toOpenAiTools(tools))
                .toolChoice("auto")
                .parallelToolCalls(true)
                .temperature(0)
                .build();

            // 2. 调 LLM
            AssistantMessage assistant = openai.chat(llmReq);
            session.addAssistant(assistant);

            // 3. 无 tool_calls → 收尾
            if (assistant.toolCalls() == null || assistant.toolCalls().isEmpty()) {
                sessions.save(session);
                return ChatResponse.answer(session.id(), assistant.content());
            }

            // 4. 逐个执行
            boolean paused = false;
            for (ToolCall call : assistant.toolCalls()) {
                ToolCallResult r = executor.execute(call, req.userConfirmed(), session.context());
                session.addTool(new ToolMessage(call.id(), toJson(r)));

                if (r.status() == NEED_CONFIRM) {
                    sessions.save(session);
                    return ChatResponse.pendingConfirm(session.id(), r);
                }
                if (r.status() == NEED_CLARIFY) {
                    sessions.save(session);
                    return ChatResponse.pendingClarify(session.id(), r);
                }
                // OK / ERROR → 已回灌，继续
            }
        }
        // 超过最大轮次
        sessions.save(session);
        return ChatResponse.answer(session.id(),
            "操作较复杂，请拆分后重试或联系管理员。");
    }
}
7.3 关键防护
风险	防护
LLM 死循环调工具	MAX_TURNS=6 硬截断
上下文爆炸	session 超 N 轮做摘要压缩
temperature 不稳	固定 temperature=0
并行工具相互依赖	写操作禁用 parallel（或同实例串行）
7.4 验收标准
[ ] 单步操作 1 轮完成
[ ] 确认流程正确暂停/恢复
[ ] 澄清流程正确追问
[ ] 超 6 轮安全退出
工时：6 人日

第8章 模块6：ToolCallExecutor（执行咽喉）★核心
8.1 这是整个系统的"心脏"
所有 OpenAI 协议、所有未来 MCP 调用，最终都汇聚到这一个方法。 权限、定位、确认、事务、回滚、审计——全在这里，别处一律不做。

8.2 执行流水线（七步，顺序不可乱）
1. 解析 name → Capability      （未知则 ERROR）
2. 解析 arguments JSON         （非法则 ERROR）
3. 权限校验                    （复用操作码，失败 ERROR）
4. PathResolver 定位           （AMBIGUOUS→NEED_CLARIFY；NOT_FOUND→ERROR）
5. 确认网关                    （需确认且未确认→NEED_CONFIRM）
6. 事务执行                    （快照→dispatch→journal→audit）
7. 返回 OK
8.3 代码骨架（完整）
@Component
@RequiredArgsConstructor
public class ToolCallExecutor {

    private final CapabilityRegistry registry;
    private final PermissionService permission;
    private final PathResolver resolver;
    private final ConfirmGateway confirmGateway;
    private final Journal journal;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final HandlerDispatcher dispatcher;
    private final ObjectMapper json;

    public ToolCallResult execute(ToolCall call, boolean userConfirmed, Context ctx) {
        String name = call.function().name();

        // ── 1. name → Capability
        Capability cap;
        try {
            cap = registry.capability(name);
        } catch (UnknownToolException e) {
            return error(call, "未知能力: " + name);
        }

        // ── 2. 解析参数
        Map<String, Object> args;
        try {
            args = json.readValue(call.function().arguments(), Map.class);
        } catch (Exception e) {
            return error(call, "参数解析失败: " + e.getMessage());
        }

        // ── 3. 权限
        if (!permission.has(ctx.user(), cap.permissionCode())) {
            return error(call, "无权限执行该操作");
        }

        // ── 4. 定位
        String targetPath = (String) args.get("target_path");
        ResolveResult target = resolver.resolve(targetPath, cap.effect(), ctx);

        switch (target.status()) {
            case NOT_FOUND -> { return error(call, "未找到目标: " + targetPath); }
            case AMBIGUOUS -> {
                return new ToolCallResult(call.id(), NEED_CLARIFY, null,
                    "定位到多个实例，请补充信息", target.candidates(), null);
            }
            case UNIQUE -> { /* 继续 */ }
        }

        // ── 5. 确认网关
        Footprint fp = confirmGateway.estimate(cap, target, ctx);
        boolean confirmedFlag = Boolean.TRUE.equals(args.get("confirmed")) || userConfirmed;
        if (confirmGateway.needConfirm(cap, fp) && !confirmedFlag) {
            return new ToolCallResult(call.id(), NEED_CONFIRM, null,
                buildConfirmMsg(cap, fp), null, fp);
        }

        // ── 6. 事务执行
        try {
            Object result = tx.execute(s -> {
                Object before = cap.reversible()
                    ? dispatcher.snapshot(cap, target, ctx) : null;

                Object r = dispatcher.dispatch(cap, target, args, ctx);

                journal.record(JournalEntry.of(
                    ctx.traceId(), name, args, before, cap.effect()));
                audit.log(ctx.user(), name, args, r);
                return r;
            });
            return ok(call, result);

        } catch (BizException e) {
            return error(call, "执行失败: " + e.getMessage());
        }
    }

    private ToolCallResult ok(ToolCall c, Object r) {
        return new ToolCallResult(c.id(), OK, r, "执行成功", null, null);
    }
    private ToolCallResult error(ToolCall c, String msg) {
        return new ToolCallResult(c.id(), ERROR, null, msg, null, null);
    }
}
8.4 HandlerDispatcher（接现有平台的最后一跳）
@Component
@RequiredArgsConstructor
public class HandlerDispatcher {

    private final ApplicationContext spring;
    private final InstanceCrudService crud;     // 现有CRUD服务

    public Object dispatch(Capability cap, ResolveResult target,
                           Map<String,Object> args, Context ctx) {
        return switch (cap.effect()) {
            case CREATE -> crud.create(cap.modelCode(),
                            target.parentInstanceId(), stripMeta(args), ctx);
            case UPDATE -> crud.update(cap.modelCode(),
                            target.instanceId(), stripMeta(args), ctx);
            case DELETE -> crud.delete(cap.modelCode(),
                            target.instanceId(), ctx);
            case QUERY  -> crud.query(cap.modelCode(),
                            target.instanceId(), ctx);
            case ACTION -> invokeAction(cap, target, args, ctx);  // 调@Action方法
        };
    }

    // 去掉 target_path / confirmed 等协议字段，只留业务字段
    private Map<String,Object> stripMeta(Map<String,Object> args) {
        Map<String,Object> m = new HashMap<>(args);
        m.remove("target_path");
        m.remove("confirmed");
        return m;
    }
}
8.5 测试用例矩阵
用例	场景	期望 status
TC-EXE-01	正常新增	OK
TC-EXE-02	无权限	ERROR(无权限)
TC-EXE-03	路径定位多实例	NEED_CLARIFY
TC-EXE-04	路径不存在	ERROR(未找到)
TC-EXE-05	删除未确认	NEED_CONFIRM
TC-EXE-06	删除已确认	OK
TC-EXE-07	业务异常回滚	ERROR + 数据未变
TC-EXE-08	未知 tool name	ERROR
TC-EXE-09	参数非法 JSON	ERROR
TC-EXE-10	执行后 journal/audit 落库	记录存在
8.6 验收标准
[ ] 七步流水线全覆盖测试
[ ] 异常 100% 回滚，无脏数据
[ ] 每次写操作必有 audit + journal
[ ] 权限校验不可绕过（安全评审通过）
工时：8 人日（系统核心，重点投入）

第9章 模块7：ConfirmGateway / Journal / Audit
9.1 ConfirmGateway
@Component
public class ConfirmGateway {

    public Footprint estimate(Capability cap, ResolveResult target, Context ctx) {
        // 估算影响行数（含级联子实例）
        int count = switch (cap.effect()) {
            case DELETE -> countCascade(cap.modelCode(), target.instanceId());
            default     -> 1;
        };
        return new Footprint(count, sampleIds(target));
    }

    public boolean needConfirm(Capability cap, Footprint fp) {
        return switch (cap.confirmPolicy()) {
            case ALWAYS    -> true;
            case NEVER     -> false;
            case THRESHOLD -> fp.affectedCount() >= cap.confirmThreshold();
        };
    }
}
9.2 Journal（回滚日志）
public record JournalEntry(
    String traceId, String toolName, Map<String,Object> args,
    Object beforeSnapshot, Effect effect, Instant ts
) {}

@Component
public class Journal {
    public void record(JournalEntry e) { /* 持久化 */ }

    // 回滚：根据 beforeSnapshot 反向操作
    public void rollback(String traceId) { /* CREATE→delete, UPDATE→restore, DELETE→insert */ }
}
9.3 Audit
直接复用现有审计体系，只需多记 toolName / arguments / traceId 三个字段。

9.4 验收标准
[ ] DELETE 影响行数估算准确（含级联）
[ ] THRESHOLD 策略生效
[ ] Journal 可回滚 CREATE/UPDATE/DELETE
[ ] Audit 与现有体系打通
工时：4 人日

第10章 MCP 兼容层（留接口，本期不开服务）
// 同一份 Tool，多一个出口；执行复用同一咽喉
@Component
public class McpAdapter {

    private final CapabilityRegistry registry;
    private final ToolCallExecutor executor;

    // MCP tools/list
    public List<ToolDef> listTools() { return registry.allTools(); }

    // MCP tools/call → 转成 ToolCall → 同一执行咽喉
    public Object callTool(String name, Map<String,Object> args, Context ctx) {
        ToolCall call = new ToolCall(UUID.randomUUID().toString(), "function",
            new FunctionCall(name, toJson(args)));
        return executor.execute(call, false, ctx);
    }
}
本期只写适配层不暴露端点，P4 再开 MCP server。工时：2 人日

第11章 接口清单
11.1 对外 REST
方法	路径	说明	请求	响应
POST	/agent/chat	主对话入口	ChatRequest	ChatResponse
POST	/agent/chat/confirm	确认后继续	{sessionId, confirmed:true}	ChatResponse
GET	/agent/session/{id}	查会话	—	Session
DELETE	/agent/session/{id}	清会话	—	200
11.2 内部 SPI（团队对接边界）
接口	提供方	消费方
MetadataService	现有平台	ToolCompiler
PermissionService	现有平台	Recall, Executor
InstanceCrudService	现有平台	HandlerDispatcher
InstanceQueryService	现有平台	PathResolver
OpenAiClient	新增封装	Orchestrator
EmbeddingStore	新增	Registry, Recall
第12章 测试策略
12.1 测试金字塔
        ┌──────────────┐
        │ E2E (10%)    │  三大场景全链路
        ├──────────────┤
        │ 集成 (30%)    │  Orchestrator+Executor+真实DB
        ├──────────────┤
        │ 单元 (60%)    │  各模块独立
        └──────────────┘
12.2 E2E 黄金用例（必过）
用例	话术	期望
E2E-01	给张三新增教育经历：武汉大学，软件工程，2015-2019	1轮完成，库中新增记录
E2E-02	把张三第一段工作的项目A负责人改成李四	定位正确，字段更新
E2E-03	删除订单1001包裹2的物流记录3	弹确认→确认→删除
E2E-04	给张三加学历（信息不全）	追问缺失字段
E2E-05	给"张三"加学历（有2个张三）	澄清追问选择
12.3 LLM 稳定性测试
LLM 有随机性。每个 E2E 用例跑 20 次，成功率 ≥ 95% 才算通过。

第13章 部署与配置
13.1 配置项
agent:
  llm:
    provider: openai          # 可切 azure / 国产兼容OpenAI协议
    model: gpt-4.1
    temperature: 0
    timeout-ms: 30000
  recall:
    top-k: 8
    candidate-multiplier: 3
  orchestrator:
    max-turns: 6
    session-ttl-min: 30
  confirm:
    default-policy: NEVER
    delete-policy: ALWAYS
  embedding:
    store: pgvector           # 或 milvus
    model: text-embedding-3-small
13.2 上线开关（灰度）
agent.enabled: true
agent.whitelist-users: [admin, pilot-group]   # 先内部试用
agent.readonly-mode: false                     # true=只允许query，演示用
第14章 Sprint 计划
14.1 团队配置（建议 5 人）
角色	人数	负责
后端A（核心）	1	Executor / Dispatcher / Journal
后端B	1	Compiler / Registry / Recall
后端C	1	Orchestrator / PathResolver / REST
算法/AI	1	召回评测集 / embedding / prompt
测试	1	用例 / E2E / 稳定性
14.2 三个 Sprint（每 Sprint 2 周）
Sprint 1（基础链路，目标：单步可跑通）
任务	负责	工时
冻结第2章数据契约	全员评审	1d
ToolCompiler	B	3d
CapabilityRegistry	B	2d
PathResolver	C	5d
Executor 主流程（无确认）	A	5d
HandlerDispatcher	A	3d
Orchestrator 单轮	C	3d
OpenAiClient 封装	C	2d
单元测试	测试	全程
Sprint1 产出：POST /agent/chat 能完成「新增教育经历」一步操作（E2E-01）。

Sprint 2（召回+多轮+安全网）
任务	负责	工时
召回评测集（200条）	AI	3d
Embedding 入库 + Recall	B+AI	5d
Orchestrator 多轮循环	C	4d
ConfirmGateway	A	3d
Journal 回滚	A	4d
Audit 打通	A	1d
澄清/确认前端联调	C	3d
E2E 02-05	测试	4d
Sprint2 产出：五大 E2E 全过，召回 Recall@8≥95%，删除走确认。

Sprint 3（加固+灰度上线）
任务	负责	工时
LLM 稳定性测试（×20）	测试	4d
上下文压缩	C	3d
异常/超时/降级	A	3d
安全评审（权限不可绕过）	全员	2d
MCP 适配层	B	2d
灰度开关 + 监控埋点	C	3d
文档/培训	全员	2d
Sprint3 产出：灰度上线，pilot 用户试用，监控看板就绪。

总计：约 6 周，5 人。

第15章 风险登记册
ID	风险	概率	影响	缓解
R1	召回精度不足，选错能力	高	高	评测集守门，Recall@8≥95%才上线；兜底注入CRUD
R2	LLM 编造 ID 而非用 path	中	高	prompt 强约束 + Resolver 只认 path，编ID直接NOT_FOUND
R3	LLM 死循环调工具	中	中	MAX_TURNS=6 硬截断
R4	高危操作误执行	低	极高	ConfirmGateway强制确认 + 灰度只读模式 + 审计
R5	上下文token爆炸	中	中	多轮摘要压缩 + tools≤8
R6	现有CRUD服务不支持按modelCode动态调用	中	高	Sprint1先验证Dispatcher与现有服务对接
R7	LLM 随机性导致不稳定	高	中	temperature=0 + ×20稳定性测试
R8	权限被绕过	低	极高	权限校验在Executor强制，安全评审
15.1 必须避免的设计（工程批判）
反模式	为什么错	正确做法
全量注入所有 tools	token爆炸+命中暴跌	召回 topK≤8
让 LLM 自由探索模型树	不可控、慢、贵	受控召回
把权限/事务放进 Schema	LLM 能篡改	全留服务端 Executor
LLM 直接产 instanceId	幻觉造ID	只产 path，服务端解析
每模型手写专属工具	几千个维护爆炸	编译器自动生成
一次 LLM 调用做完所有事	不可控不可审	多轮+每步确认
LLM 改元数据/建模	极高危	永不开放
第16章 验收标准（Definition of Done）
16.1 功能 DoD
[ ] 五大 E2E 用例全过，每个 ×20 成功率 ≥95%
[ ] CRUD + Action 全覆盖
[ ] 确认/澄清流程正确
[ ] 召回 Recall@8 ≥ 95%
16.2 质量 DoD
[ ] 单元测试覆盖率 ≥ 80%
[ ] 核心 Executor 覆盖率 ≥ 95%
[ ] 异常 100% 回滚，零脏数据
[ ] 安全评审通过（权限不可绕过）
16.3 工程 DoD
[ ] 注解改动后 tools 自动重编译，无需改代码
[ ] 全链路 traceId 可追踪
[ ] 监控看板：调用量/成功率/召回率/确认率/P99
[ ] 灰度开关可一键回滚
16.4 文档 DoD
[ ] 数据契约文档（第2章）
[ ] 接口文档（第11章）
[ ] 运维手册（配置/降级/排障）
[ ] 业务方使用指南
附录A：一页纸速查（贴墙上）
【铁律】
1. 注解是唯一来源，Tool 是投影，改注解不改代码
2. execute() 是唯一执行咽喉：权限+定位+确认+事务+回滚+审计全在这
3. LLM 只产 target_path，绝不产 instanceId
4. 单次注入 tools ≤ 8，靠召回不靠堆量
5. 写操作必有 Journal + Audit
6. 高危操作必过 ConfirmGateway
7. MAX_TURNS=6 防死循环

【七步执行流水线】
name→Capability → 解析args → 权限 → 定位 → 确认 → 事务执行 → 返回

【三种回灌状态】
OK / NEED_CLARIFY(追问) / NEED_CONFIRM(弹确认) / ERROR

【路径语法】
Order[@no=1001]/Package[2]/Logistics[last]
下一步行动
本周就能启动的三件事：

冻结第2章数据契约 —— 全员评审会，1 天搞定，这是后续一切对接的基础。
后端A 验证 R6 —— 现有 CRUD 服务能否按 modelCode 动态 create/update/delete？这是最大未知风险，先打通。
AI 工程师启动召回评测集 —— 收集 200 条真实业务话术，这是 Sprint2 的前置依赖，越早越好。
需要我把以下任一项展开成可直接 commit 的完整代码（含 pom 依赖、单元测试、mock）？

① ToolCallExecutor 全套（含 7 步 + 10 个测试用例实现）
② PathResolver 全套（含 parser + 6 类 selector + 测试）
③ ToolCompiler 全套（含 Schema 生成 + 测试）
④ ConversationOrchestrator + OpenAiClient 封装（含多轮循环 mock 测试）
告诉我选哪个，我直接给周一能跑的代码。