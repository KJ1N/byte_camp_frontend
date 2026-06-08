import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDraftEditorOverlayPresentation } from "./editor-overlay-state.ts";

describe("draft editor overlay presentation", () => {
  it("dims and disables every background work surface while an asset layer is open", () => {
    const presentation = getDraftEditorOverlayPresentation(true);

    assert.equal(presentation.backgroundAriaHidden, true);
    assert.match(presentation.backgroundClassName, /pointer-events-none/);
    assert.match(presentation.backgroundClassName, /select-none/);
    assert.match(presentation.backgroundClassName, /blur-\[3px\]/);
    assert.match(presentation.backgroundClassName, /opacity-50/);
    assert.deepEqual(presentation.backgroundStyle, { filter: "blur(3px)", opacity: 0.5 });
    assert.match(presentation.layerClassName, /z-\[1000\]/);
    assert.match(presentation.layerClassName, /backdrop-blur-md/);
  });

  it("keeps the editor surfaces interactive when no asset layer is open", () => {
    const presentation = getDraftEditorOverlayPresentation(false);

    assert.equal(presentation.backgroundAriaHidden, false);
    assert.equal(presentation.backgroundStyle, undefined);
    assert.doesNotMatch(presentation.backgroundClassName, /pointer-events-none/);
    assert.doesNotMatch(presentation.backgroundClassName, /blur-\[3px\]/);
  });
});
