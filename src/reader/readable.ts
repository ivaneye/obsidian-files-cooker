import { Action } from "src/action/action";

export interface Readable {

    read(action: Action): void;
}