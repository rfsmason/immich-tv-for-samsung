import { asset, peopleBrowser, returnHomeFromPeople, viewer, type Scenario } from "./shared";
export const peopleTour: Scenario = {
  name: "people-tour",
  video: true,
  async run(context) {
    await peopleBrowser(context);
    await context.remote.ok(asset);
    await viewer(context);
    await context.remote.back(asset);
    await returnHomeFromPeople(context);
  }
};
