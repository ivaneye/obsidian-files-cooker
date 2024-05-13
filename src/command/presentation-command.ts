import FileCookerPlugin from 'main';
import { Command } from './command';

export class PresentationCommand implements Command {

    plugin: FileCookerPlugin;

    constructor(plugin: FileCookerPlugin) {
        this.plugin = plugin;
    }

    regist(): void {
        this.registStartPresentation();
        this.registStopPresentation();
    }

    private registStartPresentation() {
        this.plugin.addCommand({
            id: 'start-presentation',
            name: 'Start Presentation',
            callback: () => {
                let fontTextSize = document.body.style.getPropertyValue('--font-text-size');
                let fileLineWidth = document.body.style.getPropertyValue('--file-line-width');
                if (fontTextSize) {
                    localStorage.setItem('--font-text-size', fontTextSize);
                }
                if (fileLineWidth) {
                    localStorage.setItem('--file-line-width', fileLineWidth);
                }
                document.body.style.setProperty('--font-text-size', '26px');
                document.body.style.setProperty('--file-line-width', '1000px');
            }
        });
    }

    private registStopPresentation() {
        this.plugin.addCommand({
            id: 'stop-presentation',
            name: 'Stop Presentation',
            callback: () => {
                let fontTextSize = localStorage.getItem('--font-text-size');
                let fileLineWidth = localStorage.getItem('--file-line-width');
                if (fontTextSize) {
                    document.body.style.setProperty('--font-text-size', fontTextSize);
                } else {
                    document.body.style.setProperty('--font-text-size', '16px');
                }
                if (fileLineWidth) {
                    document.body.style.setProperty('--file-line-width', fileLineWidth);
                } else {
                    document.body.style.setProperty('--file-line-width', '700px');
                }
            }
        });
    }

}