export default async (b) => {
  await b.goto(process.env.DEMO_URL, 500);
  await b.act("t1", "#task");
  await b.fill("#task", "Call the customer");
  await b.act("t2", { css: "button", text: "Add task" });
  await b.shot("t3", { css: "li", text: "Call the customer" });
};
