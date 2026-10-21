import { asset, homeRail, type Scenario } from "./shared";
export const memories: Scenario = {
  name: "memories",
  async run(context) {
    await homeRail(context, "memories");
    await context.remote.ok(asset);
    await context.capture.still("memories");
  }
};
