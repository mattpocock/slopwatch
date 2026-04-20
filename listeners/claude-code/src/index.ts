import { sendEvents, type NormalEvent } from "@slopwatch/wire";

const _stub: NormalEvent = { kind: "stub" };
void sendEvents;
console.log("slopwatch claude-code listener stub");
