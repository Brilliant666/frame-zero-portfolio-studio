# Flow 联系卡平台图标

## 更新日常3001（2026-10-09）

用户确认更新后，将较小图标候选原样复制为 `local-m3/pr35-flow-contact-icons-small-daily-20261009/release`，BUILD_ID `oHABQTaKO8PhJXSg0-a-N`。35070文件长度／时间及1435关键文件SHA256匹配，不重新构建。旧滚轮版release、候选和原PG保留；应用切换后登录／公开页200，12项公开JS/CSS与release哈希一致。1107×892现场确认四图标44px、外链_blank及noopener noreferrer保留、原文不变，无横向溢出与控制台warn/error。六张业务表、135素材文件元信息、配置前后MATCH，5份草稿与1个Published不改。无迁移、内容发布、提交、推送或合并。新daily父目录保存manifest、HTTP与保护结果及before/after-contact.jpg；恢复命令见SESSION_HANDOFF。

## 追加：图标比例修正（2026-10-09）

用户认为64px图标偏大。通过真实浏览器检查参考站：当前1107×892视口中，联系卡295×108px，图标外框44px／圆角10px；本站卡宽292px却使用64px，色块面积约为参考的2.1倍。本轮仅改三行CSS：桌面图标44px、间距16px、圆角10px；700px以下图标36px、间距12px、圆角9px。保留图标来源、原色、文字、卡片材质、复制与外链逻辑。

独立build（含类型）与lint通过，667项冻结输入源／候选哈希一致。新候选为 `local-m3/pr35-flow-contact-icons-small-20261009/candidate`，BUILD_ID `oHABQTaKO8PhJXSg0-a-N`，已切换3003；旧候选保留，3001与原PG进程不动。公开页和登录页200，未操作业务数据。本次小样式调整不重跑完整发布测试，上一节27项测试为上一版记录。

正式候选1107×892与上一版同数据、照片、顶部初始状态对照，原文一致、图标实测44px；390／320手机图标36px、文字与图标间隔12px，无横向溢出。浏览器无warn/error。临时样式预演已重载清除，截图来自实际新构建，临时视口已恢复。证据保留于新候选父目录的before-desktop.jpg、after-desktop.jpg、after-390.jpg、after-320.jpg和responsive.json。未提交、推送、合并或部署3001。下文记录上一轮实现及验收。

## 范围与实现

用户确认在联系卡右侧加入平台图标，保留现有透明材质、文字和操作。仅修改Flow前台显示；不改后台、内容schema、账号值、二维码、保存与发布，也不修改基础版或高级拍立得。

- 抖音、小红书、QQ、微信使用本地内嵌SVG，无远程图标请求、字体或整套图标库依赖。
- 桌面64px图标与左侧内容分列；手机44px，560px以下每行一卡，给账号和复制反馈保留空间。
- 图标为装饰、不可聚焦、不响应点击；原链接、复制按钮和可选二维码仍承担交互。
- 平台通过明确标签识别；自定义标签可由已知抖音／小红书主页域名识别。未知渠道无图标，不根据账号值猜测平台，不改写业务内容。
- URL识别使用解析后的host和域名边界，拒绝伪域名／路径文本误匹配。相关行为测试纳入现有test:admin。

## 图标来源

来源为[Simple Icons 16.0.0](https://github.com/simple-icons/simple-icons/tree/28241d80f8422eaed317ef968ad1e40b6d0d9163)，上游[CC0许可](https://github.com/simple-icons/simple-icons/blob/28241d80f8422eaed317ef968ad1e40b6d0d9163/LICENSE.md)副本保存在 `docs/licenses/simple-icons-CC0.txt`。使用四个24×24原始path，自行添加底色、圆角和尺寸，不复制参考网站的素材或代码。

| 本站渠道 | 上游文件 |
| --- | --- |
| 抖音 | [tiktok.svg](https://github.com/simple-icons/simple-icons/blob/28241d80f8422eaed317ef968ad1e40b6d0d9163/icons/tiktok.svg)，共用音符标识的单色轮廓 |
| 小红书 | [xiaohongshu.svg](https://github.com/simple-icons/simple-icons/blob/28241d80f8422eaed317ef968ad1e40b6d0d9163/icons/xiaohongshu.svg) |
| QQ | [qq.svg](https://github.com/simple-icons/simple-icons/blob/28241d80f8422eaed317ef968ad1e40b6d0d9163/icons/qq.svg) |
| 微信 | [wechat.svg](https://github.com/simple-icons/simple-icons/blob/28241d80f8422eaed317ef968ad1e40b6d0d9163/icons/wechat.svg) |

品牌标识仅用于指认用户填写的渠道，商标权仍归品牌权利人；不表示官方合作或背书。

## 验证记录

3项识别边界测试与既有24项Flow／预览测试通过。正常独立build、TypeScript及lint通过，667项冻结输入构建前后源／候选SHA256一致；构建后只追加文档。BUILD_ID `YgMmPMzg2TC1sM9bzVnEF`。

实际浏览器验收：

- 1440×900、390×844、320×844同数据、同照片、同顶部初始状态前后对照；归一化空白后的原文一致，无新增横向溢出。桌面图标64px、手机44px，均隐藏于辅助阅读、不产生额外焦点。
- QQ、微信实际复制值与页面账号匹配；测试后恢复原空剪贴板。390px微信按钮滚入可视区，底部683px，正文可视底部744px，无底栏遮挡。
- 临时模拟剪贴板拒绝，手动复制提示完整展开且没有横向溢出；恢复方法并重载清除。
- 320px临时长中英混排账号样本正常换行；文字右缘206px、图标左缘220px，无重叠，重载后恢复原文。
- 两条HTTPS外链保持原href、`target=_blank`、`rel=noopener noreferrer`。本轮不重开第三方主页或验证手机App唤起。
- 可选二维码渲染及灯箱逻辑没有修改；当前公开样本无二维码，本轮没有实际二维码点击验收。
- 浏览器无error/warn日志。早期直接CDP截图存在缩放／裁切问题，跨标签视口未匹配；这些不计作视觉证据，改用同一标签和浏览器正式视口控制重新拍摄。有效对照为 `before-matched-{width}.jpg` 与 `after-{width}.jpg`，其他早期PNG保留但不采用。

3003在空闲端口启动，路径 `local-m3/pr35-flow-contact-icons-20261009/candidate`；登录／公开页200。3001及原PG进程保持，六表、135素材文件元信息、配置前后MATCH，5份草稿与1个Published不改。没有后台／数据库写入、迁移、内容发布或日常切换。旧构建保留，未提交／推送／合并；等待候选视觉确认。私人截图、上游原始文件与运行日志仅在本机候选父目录留存。
