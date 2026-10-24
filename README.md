# dsh-chinese-chess

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的右侧栏下中国象棋。你走一方，当前会话里的模型走另一方。棋子只在 MCP 工具 `submit_move` 成功时移动。对话和思维链都不是着法。

npm 包名仍是 `dsh-dafeiyu-xiangqi`。DeepSeek Harness 用这个名字加载插件；本仓库的名字是 `dsh-chinese-chess`。

## 安装

在要用的配置目录里安装，桌面端优先，例如 `~/.dsh/profiles/desktop`。网页配置同样可以装，不要卸掉已有的侧栏包。

1. 把 `dsh-dafeiyu-xiangqi` 加进该配置 `package.json` 的 `dsh.profile.bundles`。
2. 加上依赖并安装：

```json
"dsh-dafeiyu-xiangqi": "github:VlanTech/dsh-chinese-chess"
```

```sh
npm install
```

3. 完全退出 DeepSeek Harness，再打开。

`cordis.patch.yml` 会注册插件，并拉起名为 `dafeiyu` 的 MCP 服务。脚本路径按当前配置解析，不写死某一台机器的目录。

## 怎么下

- 输入 `/chessplay`，或在对话里说「来下棋」「下象棋」。棋盘出现在右侧栏。
- 在开始界面选择「我执红」或「我执黑」。选中的一方画在下方。
- 在棋盘上走子会直接叫醒当前会话，不必再对模型说一次开始。
- 说「重来」「再来一局」「重新开始」「重开」或「新的一局」，回到选边。模型也可以调用 `mcp__dafeiyu__restart_game` 做同样的事。选边之前它不能走子。
- 轮到模型时，它先读 `mcp__dafeiyu__read_position`。坐标以模型自己的棋子在下方为准。它可以先用 `mcp__dafeiyu__preview_move` 看下一着会被吃掉哪些子，再提交唯一一着 `mcp__dafeiyu__submit_move`。欲走不会显示在棋盘上。

局面写在 `~/.dsh/profiles/desktop/dafeiyu-xiangqi.json`。桌面端和网页端共用这一份。

## 开发

```sh
node --test tests/*.test.js
```

需要本机已安装 DeepSeek Harness 的命令行包。也可以用 `DSH_PACKAGE_ROOT` 指向别的安装位置。

## 许可

[MIT](LICENSE)
