> 欢迎加微讨论：SuppleThinking

# obsidian-file-cooker

支持对文件进行批量操作的Obsidian插件。
    
## 功能

- 批量添加目标文档到指定Canvas---**v1.7.0新增**
- 添加文本到指定Canvas---**v1.7.6新增**
- 添加Dataview Task到指定Canvas---**v1.7.7新增**
- 批量移动/拷贝目标文档到指定目录
- 批量编辑目标文档属性（新增or修改，需要安装MetaEdit插件）
- 批量删除目标文档
- 批量重命名目标文档
- 批量基于链接创建文档
- 合并多个文档到指定文档
- 同步内容到flomo
- 拷贝Dataview结果链接到剪切板(**v1.7.1支持DataviewJS的页面查询语句**)

> **目标文档**：
> - Obsidian搜索出的文档
> - 当前文档中的所有链接对应的文档
> - Dataview插件的搜索结果（需要安装dataview插件）

![obsidian-file-cooker Demo Image](demo.png)

## 使用方法

- **选择**：选择想处理的一个或多个文档
- **处理**：执行对应的处理命令
- **确认**：确认执行

### 选择

目前支持三种**选择**方式：
- 拷贝需要处理的文件链接，例如：拷贝Obsidian的搜索结果到剪贴板
- 当前文档中的内容、链接
- Dataview搜索命令

### 处理

根据不同的**选择**方式，执行对应的命令即可。只需要确保：
- 在执行剪贴板相关命令时，剪贴板中有对应的文档链接
- 在执行当前文档相关命令时，已经打开了「当前文档」
- 在执行Dataview相关命令时，选中了对应的Dataview命令

### 确认

所有的执行都会弹出一个确认页面，在你确认后，才会对目标文档进行对应的操作，避免误操作。

## 如何安装

### 从Obsidian安装
通过如下方式从Obsidian进行安装：
- 打开 设置->三方插件
- 确定安全模式已关闭
- 点击打开插件列表
- 搜索"File Cooker"
- 点击安装
- 一旦安装成功，关闭三方插件窗口，激活即可使用

### 手动安装

- 下载[最新版本](https://github.com/ivaneye/obsidian-files-cooker/releases/latest)
- 解压缩到`<vault>/.obsidian/plugins/obsidian-file-cooker`目录下
注意: 某些机器上`.obsidian`目录是被隐藏的. 在MacOS上你可以按`Command+Shift+Dot`来显示隐藏目录。
- 重启Obsidian
- 如果提示安全模式，你可以关闭安全模式来启动插件。

# Buy me a coffee

<div display="flex">
  <img src="./wx_pay.png" width="300px"/>
  <img src="./alipay.png" width="300px"/>
</div>