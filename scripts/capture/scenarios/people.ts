import { peopleBrowser, type Scenario } from "./shared";
export const people: Scenario = {
  name: "people",
  async run(context) {
    await peopleBrowser(context);
    await context.capture.still("people");
  }
};
