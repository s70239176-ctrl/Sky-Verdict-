process.env.SKYVERDICT_ADDRESS ||= "0x0";
const { keeper, read, write, J } = await import("./live-check.mjs");
const r = await write(keeper, "affiliate_withdraw", [300]);
console.log("  result", J(r.result));
console.log("affiliate", J(await read("get_affiliate", [keeper.address])));
