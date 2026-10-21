import { asset, peopleBrowser, type Scenario } from "./shared";
export const personCollection: Scenario = {
  name: "person",
  async run(context) {
    await peopleBrowser(context);
    await context.remote.ok(asset);
    await context.capture.still("person");
  }
};
