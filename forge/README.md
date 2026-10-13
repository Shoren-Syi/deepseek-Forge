# DeepSeek Forge

基于重新拉取的 Harness 源码实现，不修改原有 DSH。一个原生 Agent 循环、一个运行时插件和一个工作台扩展；工具、会话、取消、权限和用量沿用原生能力。

## 启动

最终便携版在相邻的 Forge-Windows-P10 目录，双击 DeepSeek Forge.exe。整个目录可以移动到 D 盘其他位置，保持其中资源完整。已包含 Node、Python、Office、PowerShell 7 和本地文件 MCP 服务。

首次启动配置自己的 API Key，也可以稍后在模型设置中配置。浏览器使用本机 Edge；桌面截图需要模型支持图片输入；外部 MCP 地址和凭据在原生插件页面配置。

便携应用的数据默认保存在自身目录的 ForgeData。放到其他盘启动时，数据仍写入 D:/DeepSeekForge/ForgeData；FORGE_DATA_ROOT 可以指定其他 D 盘目录。不读取原有 DSH 凭据，不替换其系统协议。

## 能力与结构

新会话选择能力，开始后保持工具集稳定：

| 预设 | 能力 |
| --- | --- |
| Forge · 编程 | 文件、检索、Git、PowerShell、后台任务、TypeScript/JavaScript 定义与引用导航 |
| Forge · 文件 | 文件整理、搜索与命令执行 |
| Forge · 网页 | 隔离浏览器、DOM 操作、截图与下载，原生 Playwright MCP 接入 |
| Forge · 桌面 | 原生 Cua Driver 的 Windows 应用工具 |
| Forge · Office | Word、Excel、PowerPoint 创建编辑，独立 Python 库、Office 技能与 PDF 转换 |
| Forge · Skills / MCP | 文件系统技能、网络工具、原生外部服务连接 |

代码导航按查询启动单个 TypeScript 语义服务。默认当前 Agent 和当前模型连续执行，相关上下文优先，修改什么就检查什么，结果明确后停止。保留必要错误处理、取消清理和用户已有修改，不增加治理、风险评分或重复任务数据库。

## 工作台

原生输入框支持任务、排队消息和纠偏；可以停止运行，在同一会话继续。顶部提供文件、PowerShell 7 终端、Diff、执行日志和检查器。

检查器可常驻右侧，读取原生模型、工具活动、会话状态、输入与缓存分类、模型和工具累计耗时。等待、停止、异常、结束分别显示；费用没有来源时明确显示未知。侧栏布局由原生机制保存。执行日志支持搜索和仅看错误，报错默认展开。

输入栏「任务设置」或 Ctrl+Alt+I 打开会话预算：步骤、Token、费用估算上限，0 表示不限；暂停后提高上限再发送“继续”。价格按每百万 Token 配置，带币种和来源，没有同币种价格不猜测费用。预算控制下一步，不保证撤销已发出的请求费用。

规则路由可为新会话首轮配置简单/复杂模型与供应商支持的推理强度。手动选择和已开始的会话保持当前模型，全局默认不因路由改变。检查器显示按实际模型的 Usage、重试、切换及基于配置的估算；成本与成功率模拟器明确使用手动假设。

「工作区摘要」按需生成项目 .forge/WORKSPACE.md；「记录经验」只整理已确认的约束、决策或已验证修复到 .forge/MEMORY.md。这两个入口需要模型执行，不在每个回合自动调用。编程预设可通过原生会话检索工具寻找同工作区历史，资料不作为新的授权。

## 源码构建

使用 PowerShell 7、Node 24 和锁定的 pnpm 11.28.5。Build-Forge.cmd -Install 将 pnpm 放在独立的 forge/.local/tools 中，再安装并构建，避免安装删除正在运行的构建工具。Package-Forge.cmd 生成完整 Windows 便携目录，输出在 apps/desktop/.forge-package-build/targets/win-x64/unsigned-artifacts/win-unpacked。开发运行时与打包目录分开。不同运行包采用四个进程并行打包。

Start-Forge.cmd 优先启动相邻便携版，与直接双击应用共用便携目录下的 ForgeData，不先初始化开发数据。未打包时启动开发桌面；Web 开发模式继续使用 forge/.local，已有开发会话保留。Web 模式：

```powershell
pwsh -NoProfile -File ./forge/Start-Forge.ps1 -Mode Web -Port 3188
```

所有开发数据和缓存在 D 盘。旧 Forge 默认配置迁回内置配置，用户设置和凭据保留，原文件备份为 .before-forge-upgrade。

Windows 沙箱启动器使用自带的独立 Node，终端明确使用 PowerShell 7，避免 Electron Node 模式下的 DLL 初始化错误。上游工作区沙箱限制子进程管道；互相独立的 Node 测试可用 `node --test --experimental-test-isolation=none` 执行相同断言。依赖子进程管道的完整工具链仍需按原生权限流程处理，不自动提升权限。

## 验证范围

已检查真实文件修改、用户文件保留、非零退出反馈、长命令停止、重启续接、跨文件导航、本地浏览器页面访问、三个 Office 文件生成、DOCX/XLSX/PPTX 转 PDF、桌面工具装载，以及配置迁移的幂等性。

基础组合检查由本地模拟模型驱动真实工具。已进一步使用配置好的 DeepSeek 账户模型，在独立 Forge-Example 工作区实现折扣功能、修复金额取整、重启后续接会话，并验证三个业务案例及用户未提交内容保留。该样例采用进程内测试；标准多进程 Node 测试受上述 Windows 沙箱边界限制。

已完成一次同题 P2 测量：标准模式 12 秒 / 9 步 / 97,823 输入 Token，Forge 14 秒 / 8 步 / 50,291 输入 Token；两组测试均 3 项通过。仅此样本输入减少 48.6%，未证明整体提速或降本。详见相邻 outputs/Forge-Efficiency/效率对比.md，带账户的第三方服务尚未接入。便携版为本地未签名构建。

已完成进一步的实际任务：桌面预设通过新建记事本窗口输入并保存 `Forge-Operations/desktop-note.txt`；本地 MCP 预设使用外部文件服务读取资料、生成 `mcp-summary.md` 并读回。两项任务均由配置好的 DeepSeek 账户模型执行。

## 本地 MCP 连接

采用 [Model Context Protocol 文件服务](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)，版本锁定为 1.0.0，安装目录为相邻的 `Forge-MCP`。连接仅允许指定的 D 盘任务目录，工具只加入单独的「Forge · 本地 MCP」预设。先选择工作区，再选择预设，开始任务后保持工具集不变。

当前开发启动配置和便携版默认配置均已接入 `Forge-Operations`。重新安装或连接自己的 D 盘目录时，在源码目录运行：

```powershell
pwsh -NoProfile -File ./forge/Connect-Filesystem-Mcp.ps1 -Install
pwsh -NoProfile -File ./forge/Connect-Filesystem-Mcp.ps1 -ForgeHome ../Forge-Windows-P10/ForgeData/home -WorkspacePath D:/MyForgeWork
```

用户已有配置保留，修改前备份为 `.before-local-mcp`。其他外部服务继续通过原生 MCP 插件配置，不预设账户或凭据。

便携版不需要源码或额外安装：双击 Connect-Local-Mcp.cmd 接入自己的 Forge-Operations 目录，也可传入 D 盘目录路径。移动应用后重新运行此入口更新路径。Web 开发使用独立的 forge/.local/home；如需为该配置接入便携服务，第二个参数传入该 home 路径。

## 正式签名

当前交付目录是未签名便携版。拿到组织代码签名证书和 Windows SDK 后，可在 D 盘执行 `Sign-Forge.ps1`；脚本会对便携目录中的 EXE/DLL 使用 SHA-256 签名和时间戳，并在缺少证书、signtool 或签名失败时直接停止。Forge 不内置证书，也不把私钥写入仓库。

节点安排见 [进度与交付](进度与交付.md)。原方案只定义到 P5，P6–P10 为本次施工与交付拆分。

上游版本与提交见 upstream.json，上游许可证和原始 README 保留。

此前便携版已完成浏览器、Office 和随包 MCP 的真实模型任务。完整功能补齐增加规则路由、预算、分模型 Usage、配置单价估算、模拟器及项目摘要/记忆入口。原方案对应关系见原方案完成对照.md，实际限制保留。本次封装复用已检查的同版本运行时。

完整功能已更新至便携版。当前会话的摘要和经验入口已通过实际模型任务验证，并在切换会话后确认目标绑定正确。交付结果与验证范围见完整功能交付记录.md。

