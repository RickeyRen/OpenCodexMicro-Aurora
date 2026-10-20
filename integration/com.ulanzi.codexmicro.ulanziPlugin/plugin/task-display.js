import { normalizeStatus, taskVisual } from "./key-art.js";

/** Keep asynchronous image renders consistent with the latest key assignment. */
export function createTaskDisplay({ theme, artwork, send, isCurrent }) {
  return function setTaskDisplay(instance, status, text, identifier = "") {
    const normalized = normalizeStatus(status);
    const digest = `task:${theme}:${normalized}:${identifier}:${text}`;
    // A may already be displayed while B is rendering. Requesting A again must
    // still invalidate B, even though it needs no new image or state message.
    instance.desiredDisplay = digest;
    if (!instance.active || instance.lastDisplay === digest || instance.pendingDisplay === digest) return;
    instance.pendingDisplay = digest;
    return artwork.render(normalized, text, identifier).catch(error => {
      send({ cmd: "logMessage", uuid: instance.uuid, actionid: instance.actionid, key: instance.key,
        level: "error", message: `Task artwork: ${error.message}` });
      // Preserve status, short label and identifier if native encoding fails.
      return { type: 1, data: taskVisual(normalized, text, 0, identifier) };
    }).then(image => {
      if (!instance.active || instance.desiredDisplay !== digest || instance.lastDisplay === digest
        || !isCurrent(instance)) return;
      instance.lastDisplay = digest;
      send({
        cmd: "state",
        param: {
          statelist: [{
            uuid: instance.uuid,
            actionid: instance.actionid,
            key: instance.key,
            ...image,
            showtext: false,
            textdata: text
          }]
        }
      });
    }).finally(() => {
      if (instance.pendingDisplay === digest) instance.pendingDisplay = null;
    });
  };
}
