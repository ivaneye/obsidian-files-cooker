> 欢迎加微讨论：SuppleThinking

# obsidian-file-cooker

This plugin for Obsidian deals batch notes from search results、current file、Dataview query string...
    
## Features

- Move Multi-Files
    - Move search results to target folder
    - Move all links in current file to target folder
    - Move dataview results to target folder
- Delete Multi-Files
    - Delete search results
    - Delete all links in current file
    - Delete dataview results

![obsidian-file-cooker Demo Image](demo.png)

## Usage

### Move Multi-Files
#### Move search results to target folder
`from v1.0.0`
- Query files from Search Plugin
- Copy Search Result
- Run Command 「Move files to ...」
- Select target folder
- Confirm

#### Move all links in current file to target folder
`from v1.1.0`
- Run Command 「Move links in current file to ...」
- Select target folder
- Confirm

#### Move dataview results to target folder
`from v1.3.0`
- select dataview query string
- Run Command 「Move dataview query results to ...」
- Select target folder
- Confirm

### Delete Multi-Files
#### Delete search results
`from v1.2.0`
- Query files from Search Plugin
- Copy Search Result
- Run Command 「Delete files in clipboard ...」
- Confirm

#### Delete all links in current file
`from v1.2.0`
- Run Command 「Delete link-files in current file ...」
- Confirm

#### Delete dataview results
`from v1.3.0`
- select dataview query string
- Run Command 「Delete dataview query results!」
- Confirm

## Manual installation

- Download the [latest release](https://github.com/ivaneye/obsidian-files-cooker/releases/latest)
- Extract the obsidian-file-cooker folder from the zip to your vault's plugins folder: `<vault>/.obsidian/plugins/`  
Note: On some machines the `.obsidian` folder may be hidden. On MacOS you should be able to press `Command+Shift+Dot` to show the folder in Finder.
- Reload Obsidian
- If prompted about Safe Mode, you can disable safe mode and enable the plugin.