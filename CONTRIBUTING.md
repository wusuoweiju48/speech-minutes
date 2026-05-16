# 组员上手指南

> 这份文档是给项目组员看的。从零开始,跟着做就能提交代码。

---

## 一、首次准备(只做一次)

### 1. 注册 GitHub 账号

打开 https://github.com → 右上角 Sign up → 用邮箱注册。**把你的 GitHub 用户名告诉项目负责人**,他需要把你加进仓库。

### 2. 接受协作邀请

负责人邀请后,你的注册邮箱会收到一封 GitHub 邀请邮件,点里面的链接 → **Accept invitation**。没收到也可以直接打开仓库链接,如果没接受会显示 "View invitation"。

### 3. 安装 Git

- Windows: https://git-scm.com/download/win 下载安装,**全程默认下一步**即可
- Mac: 打开终端跑 `git --version`,首次会提示安装,跟着提示走
- 装完打开 **Git Bash**(Windows) 或终端(Mac),跑 `git --version` 看到版本号就 OK

### 4. 配置你的身份

打开 Git Bash 跑(替换成你的真实姓名和 GitHub 注册邮箱):

```bash
git config --global user.name "你的姓名"
git config --global user.email "your-github@example.com"
```

> ⚠️ **邮箱必须是你 GitHub 账号的邮箱**,否则你的 commit 不会显示在你 GitHub 主页的贡献图上(老师查谁做了什么时,贡献图是重要凭证)。

### 5. 生成 Personal Access Token (PAT)

GitHub 现在不能用密码 push,要用 PAT 代替。

1. 打开 https://github.com/settings/tokens
2. **Generate new token** → **Tokens (classic)** → Generate new token (classic)
3. **Note**(名字):填 `speech-minutes-我的电脑`
4. **Expiration**:选 `90 days`(够用到课程结束)
5. **Scopes**:**只勾第一项 `repo`**(私有仓需要)
6. 最底部 **Generate token** → **立刻复制**那串 `ghp_...` 开头的字符
7. **把它存到你自己的密码管理器/记事本里。它只显示一次,关掉页面就再也看不到了**

> 🚨 **绝对不要把 token 发给任何人,不要粘到聊天里,不要提交进代码**。一旦泄露,立即去同一页面 Revoke 撤销,然后重新生成。

### 6. Clone 仓库

打开 Git Bash,**进入你想存放项目的文件夹**(比如桌面),跑:

```bash
git clone https://github.com/wusuoweiju48/speech-minutes.git
cd speech-minutes
```

第一次 clone 会弹认证窗口或在命令行问账号密码:
- Username 填:**你的 GitHub 用户名**
- Password 填:**第 5 步的 PAT**(屏幕不显示任何字符是正常的,直接粘贴回车)

成功后会下载所有文件到 `speech-minutes` 目录。

---

## 二、日常协作循环

**每次开始改代码前,先 pull 拉最新代码**(避免和别人冲突):

```bash
git pull
```

**改完代码后,提交并推送**:

```bash
# 1. 看自己改了什么
git status

# 2. 添加要提交的文件
git add .                    # 提交所有改动
# 或者只加某个文件:
git add frontend/app.js

# 3. 提交,写一句清楚的描述
git commit -m "[模块] 简短描述,例如:[frontend] 添加录音波形显示"

# 4. 推送到 GitHub
git push
```

> 提交信息推荐用 `[模块] 描述` 格式,模块包括:`frontend` / `backend` / `docs` / `report` / `fix`

---

## 三、常见问题

### Q1: push 时报 `failed to push some refs`

**原因**:别人先推了新代码,你的本地落后了。

```bash
git pull --rebase     # 拉别人的改动,把你的提交叠在最上面
git push              # 再推一次
```

### Q2: 出现 `merge conflict` 冲突提示

**原因**:你和别人改了同一个文件的同一处。

```bash
# 1. 看哪些文件冲突
git status

# 2. 打开冲突文件,会看到这种标记:
# <<<<<<< HEAD
# 你的版本
# =======
# 别人的版本
# >>>>>>> origin/master
# 手动选择保留哪部分,删掉 <<<<<<< ======= >>>>>>> 三行

# 3. 标记冲突已解决
git add 冲突的文件
git commit -m "[fix] 解决冲突"
git push
```

**避免冲突的最佳办法**:小组事先约好谁负责哪部分代码,别同时改同一个文件。

### Q3: push 时一直卡在认证

- 你电脑里 Windows 凭据管理器存了错的 token → 控制面板 → 用户账户 → 凭据管理器 → Windows 凭据 → 找 `git:https://github.com` → 删除 → 下次 push 重新输
- Mac: 钥匙串访问 → 搜 `github.com` → 删除

### Q4: token 弄丢了 / 过期了

直接去 https://github.com/settings/tokens 重新生成一个,旧的撤销。然后下次 push 时用新 token 替换。

### Q5: 没梯子,push 卡死

试一下:
1. 装 [GitHub Desktop](https://desktop.github.com/) 客户端,GUI 操作,网络容错好一点
2. 或者命令行配代理(端口看你代理软件):
   ```bash
   git config --global http.proxy http://127.0.0.1:7890
   git config --global https.proxy http://127.0.0.1:7890
   ```
3. 实在不行联系项目负责人,把代码用其他方式(微信/邮箱)发给他帮你合并

---

## 四、不要提交的东西

`.gitignore` 已经配好,正常 `git add .` 不会带上这些:

- `.env`(含 API key 的配置文件)
- 模型文件(`*.bin` 等大文件)
- IDE 配置(`.vscode/` `.idea/`)
- 录音/音频中间产物
- 压缩包(`*.rar` `*.zip`)

如果你不小心 `git add` 了不该加的:
```bash
git restore --staged 不该加的文件   # 取消暂存
```

---

## 五、需要帮助?

群里直接喊负责人,或者在 GitHub 仓库 → Issues → New issue 开个工单描述卡在哪一步,会有人帮你看。

---

*本指南最后更新: 2026-05-16*
