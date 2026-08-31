import { createStarHost } from "../js/starGameHost.js";
import * as rules from "./rules.js";

export { HOST_ID } from "./rules.js";

export function createTableTennisHost(opts) {
  return createStarHost({ ...opts, rules });
}
