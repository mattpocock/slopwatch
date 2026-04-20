export type NormalEvent = {
  kind: "stub";
};

export const sendEvents = async (_events: NormalEvent[]): Promise<void> => {
  throw new Error("not implemented");
};
