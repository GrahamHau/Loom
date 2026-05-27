import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

class FakeElement {
  constructor(attrs = {}, options = {}) {
    this.attrs = attrs;
    this.textContent = options.textContent || "";
    this.id = options.id || "";
    this.closestResult = options.closestResult || this;
  }

  getAttribute(name) {
    return this.attrs[name] || "";
  }

  querySelector(selector) {
    return this.attrs.__queryMap?.[selector] || null;
  }

  closest() {
    return this.closestResult || this;
  }
}

function textNode(text) {
  return new FakeElement({}, { textContent: text });
}

const REVIEW_CONTENT_SELECTOR = "[data-hook='review-collapsed'] span, [data-hook='review-body'] span, [data-hook='reviewRichContentContainer'], .review-text-content span, .review-text, .cr-original-review-content, .review-data, .a-cardui-body, .a-cardui-content";

function loadAmazonExtractor({ selectorMap = {}, firstMap = {}, title = "Amazon Product" } = {}) {
  const source = readFileSync(new URL("./content/amazon.js", import.meta.url), "utf8");
  const document = {
    title,
    querySelectorAll(selector) {
      return selectorMap[selector] || [];
    },
    querySelector(selector) {
      return firstMap[selector] || selectorMap[selector]?.[0] || null;
    },
  };
  const sandbox = {
    document,
    window: {
      __loom_extractors: {},
      location: {
        href: "https://www.amazon.com/dp/B012345678",
        pathname: "/dp/B012345678",
      },
    },
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.__loom_extractors.amazon;
}

describe("amazon content extractor", () => {
  it("collects visible reviews into normalized comments", () => {
    const reviewA = new FakeElement({ __queryMap: {
      [REVIEW_CONTENT_SELECTOR]: textNode("Really useful magnetic mount"),
      ".a-profile-name, [data-hook='genome-widget'] .a-profile-name, .a-profile-content": textNode("Alice"),
      "[data-hook='review-date'], .review-date, span.a-size-base.a-color-secondary.review-date": textNode("Reviewed in the United States on May 1, 2026"),
      "[data-hook='helpful-vote-statement'], .cr-vote-text": textNode("3 people found this helpful"),
    }, id: "review-a" }, { id: "review-a" });
    const reviewB = new FakeElement({ __queryMap: {
      [REVIEW_CONTENT_SELECTOR]: textNode("Brightness is good for desk shooting"),
      ".a-profile-name, [data-hook='genome-widget'] .a-profile-name, .a-profile-content": textNode("Bob"),
      "[data-hook='review-date'], .review-date, span.a-size-base.a-color-secondary.review-date": textNode("Reviewed in Canada on May 3, 2026"),
      "[data-hook='helpful-vote-statement'], .cr-vote-text": textNode("One person found this helpful"),
    }, id: "review-b" }, { id: "review-b" });

    const extract = loadAmazonExtractor({
      selectorMap: {
        "#feature-bullets li span.a-list-item": [textNode("Magnetic mount for quick setup")],
        "[data-hook='review']": [reviewA, reviewB],
      },
      firstMap: {
        "#productTitle": textNode("Magnetic Fill Light"),
        "#acrPopover": textNode("4.5 out of 5 stars"),
        "#acrCustomerReviewText": textNode("128 ratings"),
        "#landingImage": new FakeElement({ src: "https://img.test/cover.jpg" }),
      },
    });

    const result = extract();

    expect(result.comments).toBe(2);
    expect(result.visible_comments).toHaveLength(2);
    expect(result.visible_comments).toEqual([
      {
        id: "review-a",
        user_name: "Alice",
        content: "Really useful magnetic mount",
        like_count: 3,
        posted_at_text: "Reviewed in the United States on May 1, 2026",
        is_reply: false,
      },
      {
        id: "review-b",
        user_name: "Bob",
        content: "Brightness is good for desk shooting",
        like_count: 1,
        posted_at_text: "Reviewed in Canada on May 3, 2026",
        is_reply: false,
      },
    ]);
  });

  it("collects review cards that only expose customer_review ids", () => {
    const reviewA = new FakeElement({ __queryMap: {
      [REVIEW_CONTENT_SELECTOR]: textNode("The rubber pad is separate from the metal plate"),
      ".a-profile-name, [data-hook='genome-widget'] .a-profile-name, .a-profile-content": textNode("A man needs to shave"),
      "[data-hook='review-date'], .review-date, span.a-size-base.a-color-secondary.review-date": textNode("Reviewed in the United States on February 11, 2023"),
      "[data-hook='helpful-vote-statement'], .cr-vote-text": textNode("One person found this helpful"),
    }, id: "customer_review-R1" }, { id: "customer_review-R1" });

    const extract = loadAmazonExtractor({
      selectorMap: {
        "[id^='customer_review-']": [reviewA],
      },
      firstMap: {
        "#productTitle": textNode("PROAIM Laptop Workstation"),
        "#acrPopover": textNode("3.7 out of 5 stars"),
        "#acrCustomerReviewText": textNode("20 Reviews"),
      },
    });

    const result = extract();

    expect(result.comments).toBe(1);
    expect(result.visible_comments).toHaveLength(1);
    expect(result.visible_comments[0]).toMatchObject({
      id: "customer_review-R1",
      user_name: "A man needs to shave",
      content: "The rubber pad is separate from the metal plate",
      like_count: 1,
      posted_at_text: "Reviewed in the United States on February 11, 2023",
    });
  });

  it("collects newer Amazon review rich content cards", () => {
    const reviewA = new FakeElement({ __queryMap: {
      [REVIEW_CONTENT_SELECTOR]: textNode("Brief content visible, double tap to read full content. Full content visible, double tap to read brief content. I'm knocking a star off because the mat slides easily on the metal platform.Read moreRead less"),
      ".a-profile-name, [data-hook='genome-widget'] .a-profile-name, .a-profile-content": textNode("Leo"),
      "[data-hook='review-date'], .review-date, span.a-size-base.a-color-secondary.review-date": textNode("Reviewed in the United States on April 16, 2022"),
      "[data-hook='helpful-vote-statement'], .cr-vote-text": textNode("One person found this helpful"),
    }, id: "R3DRUJZYB553OF" }, { id: "R3DRUJZYB553OF" });

    const extract = loadAmazonExtractor({
      selectorMap: {
        "[data-hook='review']": [reviewA],
      },
      firstMap: {
        "#productTitle": textNode("PROAIM Laptop Workstation"),
        "#acrPopover": textNode("3.7 out of 5 stars"),
        "#acrCustomerReviewText": textNode("20 Reviews"),
      },
    });

    const result = extract();

    expect(result.visible_comments).toHaveLength(1);
    expect(result.visible_comments[0]).toMatchObject({
      id: "R3DRUJZYB553OF",
      user_name: "Leo",
      content: "I'm knocking a star off because the mat slides easily on the metal platform.",
      like_count: 1,
    });
  });
});
