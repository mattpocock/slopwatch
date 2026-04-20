import { sendEvents, type NormalEvent } from "@slopwatch/events";

const _stub: NormalEvent = { kind: "stub" };
void sendEvents;
console.log("slopwatch claude-code listener stub");
