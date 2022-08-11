> 欢迎加微讨论：SuppleThinking

# obsidian-file-cooker

批量操作搜索结果、当前文件中的链接以及Dataview结果的插件～
    
## 功能

- 批量移动/拷贝文档
    - 将搜索出的文档，批量移动到目标目录下
    - 将当前文件中的所有链接对应的文档移动到目标目录下
    - 将Dataview插件的结果批量移动到目标目录下
- 批量编辑文件属性（新增or修改），包括
    - 搜索出的文档
    - 当前文件中的文档
    - Dataview查询出的文档
- 批量删除文档
    - 批量删除搜索出的文档
    - 批量删除将当前文档中的所有链接对应的文档
    - 批量删除Dataview插件的结果
- 拷贝Dataview结果链接到剪切板

![obsidian-file-cooker Demo Image](demo.png)

## 使用方法

### 批量移动/拷贝文档
#### 将搜索结果移动到目标目录
`from v1.0.0`
- 通过ob的搜索功能进行文档搜索
- 拷贝搜索结果
- 执行命令「Move files to ...」
- 选择目标文件夹
- 确定
- 选择移动或拷贝
- 确定

#### 将当前文档中所有链接对应的文件移动/拷贝到目标目录
`from v1.1.0`
- 执行命令「Move links in current file to ...」
- 选择目标文件夹
- 确定
- 选择移动或拷贝
- 确定

#### 将Dataview查询结果移动/拷贝到目标目录
`from v1.3.0`
- 选中Dataview查询语句
- 执行命令「Move dataview query results to ...」
- 选择目标文件夹
- 确定
- 选择移动或拷贝
- 确定

### 批量编辑文档属性

> 需要安装MetaEdit插件

`from v1.4.0`
#### 搜索出的文档
- 通过ob的搜索功能进行文档搜索
- 拷贝搜索结果
- 执行命令「Edit Front Matter in clipboard files ...」
- 填写key和value
- 确定

#### 当前文件中的文档
- 执行命令「Edit Front Matter in current file links ...」
- 填写key和value
- 确定

#### Dataview查询出的文档
- 选中Dataview查询语句
- 执行命令「Edit Front Matter in dataview results ...」
- 填写key和value
- 确定

### 批量删除文档
#### 删除搜索结果
`from v1.2.0`
- 通过ob的搜索功能进行文档搜索
- 拷贝搜索结果
- 执行命令「Delete files in clipboard ...」
- 确定

#### 删除当前文档中所有链接对应的文件
`from v1.2.0`
- 执行命令「Delete link-files in current file ...」
- 确定

#### 删除Dataview查询结果
`from v1.3.0`
- 选中Dataview查询语句
- 执行命令「Delete dataview query results!」
- 确定

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