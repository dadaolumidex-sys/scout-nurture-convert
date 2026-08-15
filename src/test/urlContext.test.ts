import { describe, expect, it } from "vitest";
import { extractPublicUrls } from "../../supabase/functions/_shared/urlContext";

describe("live URL context", () => {
  it("extracts and deduplicates public links", () => {
    expect(extractPublicUrls("Read https://example.com/page, then https://example.com/page."))
      .toEqual(["https://example.com/page"]);
  });

  it("blocks localhost and private-network links", () => {
    expect(extractPublicUrls("http://127.0.0.1:5174 http://localhost/test http://192.168.1.2/private"))
      .toEqual([]);
  });

  it("limits each message to two links", () => {
    expect(extractPublicUrls("https://one.example https://two.example https://three.example"))
      .toHaveLength(2);
  });
});
