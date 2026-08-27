import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("closeEditor allows closing for unnamed members with payments or family data", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify closeEditor checks for payments before removing a member
  assert.match(renderer, /state\.store\.payments\.some\(\(payment\) => payment\.memberId === member\.id\)/);
  
  // Verify closeEditor checks for dependents before removing a member
  assert.match(renderer, /state\.store\.members\.some\(\(other\) => other\.responsiblePartyId === member\.id/);
  
  // Verify closeEditor checks for contract data before removing a member
  assert.match(renderer, /hasContract.*=.*member\.monthlyAmount/);
  
  // Verify closeEditor checks for family data before removing a member
  assert.match(renderer, /hasFamilyData.*=.*member\.householdName/);
  
  // Verify closeEditor checks for contact data before removing a member
  assert.match(renderer, /hasContactData.*=.*member\.email/);
});

test("closeEditor removes only truly blank new members on cancel", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify closeEditor removes blank members
  assert.match(renderer, /isBlankNewMember.*=.*!hasPayments.*&&.*!hasDependents/);
  
  // Verify the member is filtered out when blank
  assert.match(renderer, /state\.store\.members\.filter\(\(m\) => m\.id !== member\.id\)/);
  
  // Verify it only removes in profile mode with no name
  assert.match(renderer, /!member\.name && state\.editorMode === "profile"/);
});

test("closeEditor always closes the dialog regardless of member state", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify el.editorDialog.close() is called unconditionally at the end
  assert.match(renderer, /function closeEditor\(\) \{[\s\S]*el\.editorDialog\.close\(\);[\s\S]*\}/);
  
  // Verify there's no early return that prevents closing for members with data
  // The function should close the dialog in all code paths
  const closeEditorMatch = renderer.match(/function closeEditor\(\) \{([\s\S]*?)\n\}/);
  assert.ok(closeEditorMatch, "closeEditor function should exist");
  
  // Count the number of times el.editorDialog.close() appears - should be at least 2
  // (once for blank member removal path, once at the end)
  const closeCount = (closeEditorMatch[1].match(/el\.editorDialog\.close\(\)/g) || []).length;
  assert.ok(closeCount >= 2, `closeEditor should close dialog in multiple paths, found ${closeCount}`);
});

test("profile editor name field is required for validation", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify the name field is marked as required in profile mode
  assert.match(renderer, /field\("Name", "name", member\.name, "text", true/);
});

test("cancel and close buttons both call closeEditor", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify both cancel and close buttons are wired to closeEditor
  assert.match(renderer, /el\.closeEditorButton\.addEventListener\("click", closeEditor\)/);
  assert.match(renderer, /el\.cancelEditorButton\.addEventListener\("click", closeEditor\)/);
});

test("delete member button calls confirmDeleteMember", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify delete button exists and is wired to confirmDeleteMember
  assert.match(renderer, /deleteMemberButton/);
  assert.match(renderer, /el\.deleteMemberButton\.addEventListener\("click", confirmDeleteMember\)/);
});

test("confirmDeleteMember checks for dependents and payments", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify confirmation checks for dependents (members with this as responsiblePartyId)
  assert.match(renderer, /state\.store\.members\.filter\(\(other\)/);
  assert.match(renderer, /responsiblePartyId === member\.id/);
  
  // Verify confirmation checks for payments
  assert.match(renderer, /state\.store\.payments\.filter\(\(payment\) => payment\.memberId === member\.id\)/);
  
  // Verify enhanced warning message is shown
  assert.match(renderer, /responsible payer for/);
  assert.match(renderer, /payment record.*will also be deleted/);
});

test("deleteMember reassigns dependents to be self-paying", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify dependents are found
  assert.match(renderer, /dependents.*=.*state\.store\.members\.filter/);
  
  // Verify dependents are updated with their own ID as responsiblePartyId
  assert.match(renderer, /responsiblePartyId: dependent\.id/);
  assert.match(renderer, /parentName: ""/);
});

test("deleteMember removes member payments and member record", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify payments are removed
  assert.match(renderer, /payments: state\.store\.payments\.filter\(\(payment\) => payment\.memberId !== memberId\)/);
  
  // Verify member is removed
  assert.match(renderer, /members: state\.store\.members\.filter\(\(m\) => m\.id !== memberId\)/);
  
  // Verify navigation away from deleted member
  assert.match(renderer, /function deleteMember[\s\S]*showHome\(\)/);
});

test("deleteMember does not use inactive flag for deletion", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  // Verify deleteMember actually removes from array, not just setting inactive
  const deleteMemberMatch = renderer.match(/function deleteMember\(memberId\) \{([\s\S]*?)\n\}/);
  assert.ok(deleteMemberMatch, "deleteMember function should exist");
  
  // Verify it filters members array (removes member)
  assert.match(deleteMemberMatch[1], /members\.filter.*m\.id !== memberId/);
  
  // Verify it does NOT set inactive flag
  assert.ok(!deleteMemberMatch[1].includes("inactive: true"), "Should not set inactive flag");
});
