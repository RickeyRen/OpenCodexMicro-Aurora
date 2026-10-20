# Attribution, modifications and responsibility

## Upstream provenance

OpenCodexMicro was originally created by **Nian Liu** (copyright 2026). The original copyright and MIT permission notice are preserved in `LICENSE`.

Aurora is an independent fork by **RickeyRen**, published at https://github.com/RickeyRen/OpenCodexMicro-Aurora. Its direct upstream is https://github.com/UlanziTechnology/OpenCodexMicro, itself derived from https://github.com/He11oLiu/openCodexMicro. Git history records inherited work and individual changes.

The inherited Ulanzi integration removed the standalone Python/D200 HID runtime and made Ulanzi Studio the device integration layer. It added plugin packaging, setup tooling and documentation around the existing local Bridge. In that upstream distribution, Ulanzi's implementation and maintenance scope was the `integration/com.ulanzi.codexmicro.ulanziPlugin/` directory. The plugin consumes state and action interfaces exposed by the inherited Bridge. Ulanzi did not design, specify, develop or maintain CDP or Codex's CDP implementation.

## Aurora modifications

Aurora 0.5.0 adds thirteen independent conversation keys, actual chat titles, persistent identifiers and local aliases; original Aurora Silk animated artwork; native CoreText label composition; an opt-in D200H wide display with usage and AI activity; bounded sidebar routing; safer launchers and read-only diagnostics; request-origin/Host guards; strict usage normalization; portable setup, packaging and multilingual onboarding.

These modifications, their packaging and their documentation are maintained by this independent fork. Publication under RickeyRen's account does **not** extend Ulanzi's, Nian Liu's or any upstream contributor's support or maintenance responsibilities. No upstream review or endorsement is implied. Files that retain inherited work retain their attribution.

## Products and responsibility

- Codex and ChatGPT are OpenAI products or trademarks. This project is an unofficial integration and is not affiliated with, sponsored by, endorsed by or supported by OpenAI.
- Ulanzi, Ulanzi Studio and D200 product names belong to their respective rights holders. This Aurora fork is not an official Ulanzi release and is not endorsed or supported by Ulanzi.
- Third-party components retain the licenses and notices in `THIRD_PARTY_NOTICES.md`. Their authors are not responsible for this integration.
- Users and distributors are responsible for reviewing compatibility, local debugger access, third-party terms and the changes they install or redistribute.

The software is provided without warranty under `LICENSE`. Internal application interfaces and future third-party versions may be incompatible.

## 中文说明

OpenCodexMicro 原作者为 Nian Liu，版权与 MIT 许可完整保留。Aurora 是 RickeyRen 独立发布和维护的 fork，直接继承 UlanziTechnology/OpenCodexMicro，后者基于 He11oLiu/openCodexMicro。

继承的 Ulanzi 工作将硬件接入收敛为 Studio 插件及安装工具；其上游维护范围仅为插件目录。插件消费现有 Bridge 的状态与动作接口，Ulanzi 没有参与 CDP 或 Codex CDP 实现的设计、规范制定、开发或维护。

本 fork 新增 13 个独立对话格、真实会话标题、固定编号、本机别名、原创极光丝带动画、CoreText 字形合成、可选 D200H 长条额度与 AI 状态、侧栏适配、安全检查及可复现安装与打包。Aurora 改动由本 fork 负责，不扩大原作者、Ulanzi 或其他上游贡献者的维护和支持义务，不暗示他们审查或认可本版本。

本版本不代表 OpenAI 或 Ulanzi 官方发布、赞助、背书或支持。产品名称归各自权利人所有；第三方组件继续适用其许可；软件担保和责任限制以 MIT 许可为准。
