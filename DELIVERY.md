# NestLife 交付清单（买家保存）

> 交付核对用。签收前逐项确认，完成后即视为验收通过。

## 一、交付内容（✓ 逐项确认）

- [ ] 安装包：`nestlife-v1.0.tar.gz`（或 Docker 镜像）
- [ ] 文档：INSTALL.md（安装）· USAGE.md（使用）· DEPLOY.md（排错）· CHANGELOG.md · LICENSE
- [ ] 远程部署支持 1 次（含基础配置：认证/端口/数据目录）

## 二、部署验收（三选一，完成后勾选）

- [ ] **Docker**：`docker compose up -d` → `http://localhost:3100` 可访问
- [ ] **Linux 一键**：`sudo bash install.sh /opt/nestlife` → `systemctl status nestlife` 为 active
- [ ] **手动**：`npm ci && npm run build && npm run start -- -p 3100` → 可访问

## 三、首次使用验收

- [ ] 首次打开自动初始化（默认菜单/时刻表/习惯）
- [ ] 能添加任务（试试「明天下午3点交材料」）
- [ ] 能勾选完成、写一条日复盘
- [ ] 设置页：能备份一次、能打开 AI 助手接入

## 四、安全配置（建议立即做）

- [ ] `.env` 设置强密码 `NESTLIFE_ADMIN_PASSWORD`（并启用 `NESTLIFE_AUTH=1`）
- [ ] 确认 `NESTLIFE_DATA` 数据目录已备份一份到安全位置

## 五、授权确认

- [ ] 已了解 **双轨授权**：个人/非商用免费；组织或商用需购买商业授权
- [ ] 如需商用，已联系授权方确认授权范围

## 六、售后说明

- 含 **1 次远程协助部署**（首次安装）
- 后续支持 / 升级：凭购买凭证按次或按年计费
- 联系：重庆巢外科技有限责任公司（NestLife™）

---

**验收人：** ____________　**日期：** ____________
