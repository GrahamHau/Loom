(function registerXhsExtractor() {
  window.__loom_extractors = window.__loom_extractors || {};
  window.__loom_extractors.xiaohongshu = function extractXhs() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const first = (selectors, root = document) => {
      for (const selector of selectors) {
        const el = root.querySelector(selector);
        if (el) return el;
      }
      return null;
    };
    const normalizeImageUrl = (url) => {
      if (!url) return "";
      const value = String(url).trim();
      if (!value || value.startsWith("data:")) return "";
      try {
        return new URL(value, window.location.href).toString();
      } catch {
        return value;
      }
    };
    const cssImageUrl = (value) => {
      const match = String(value || "").match(/url\((['"]?)(.*?)\1\)/i);
      return normalizeImageUrl(match?.[2] || "");
    };
    const urlFromSrcset = (value) => {
      const firstCandidate = String(value || "").split(",")[0]?.trim().split(/\s+/)[0];
      return normalizeImageUrl(firstCandidate || "");
    };
    const isBadImage = (url) => {
      const value = String(url || "").toLowerCase();
      return !value ||
        value.includes("logo") ||
        value.includes("favicon") ||
        value.includes("avatar") ||
        value.includes("default") ||
        value.includes("placeholder") ||
        value.includes("sprite") ||
        value.includes("sns-webpic-qc.xhscdn.com") && value.includes("logo");
    };
    const isIrrelevantNode = (node) => {
      const badContainer = node.closest([
        "[class*='avatar']",
        "[class*='author']",
        "[class*='user']",
        "[class*='comment']",
        "[class*='recommend']",
        "[class*='related']",
        "[class*='sidebar']",
        "[class*='aside']",
        "[class*='nav']",
        "[class*='toolbar']",
      ].join(","));
      return Boolean(badContainer);
    };
    const currentPath = (() => {
      try {
        return new URL(window.location.href).pathname.replace(/\/+$/, "");
      } catch {
        return String(window.location.pathname || "").replace(/\/+$/, "");
      }
    })();
    const currentNoteId = currentPath.split("/").filter(Boolean).pop() || "";
    const sameCurrentPath = (href) => {
      if (!href || !currentPath) return false;
      try {
        return new URL(href, window.location.href).pathname.replace(/\/+$/, "") === currentPath;
      } catch {
        return false;
      }
    };
    const decodeHtml = (value) => {
      const textValue = String(value || "");
      if (!/[&<>]/.test(textValue)) return textValue;
      const textarea = document.createElement("textarea");
      textarea.innerHTML = textValue;
      return textarea.value;
    };
    const decodeScriptString = (value) => {
      const raw = String(value || "");
      try {
        return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
      } catch {
        return raw
          .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    };
    const normalizeNoteText = (value, titleText = "", authorText = "") => {
      const blockedLines = new Set([
        "关注",
        "添加",
        "说点什么",
        "评论",
        "点击评论",
        "这是一片荒地",
        "- THE END -",
        "展开",
        "收起",
      ]);
      const seen = new Set();
      return decodeHtml(value)
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((line) => {
          if (seen.has(line)) return false;
          seen.add(line);
          if (line === titleText || line === authorText) return false;
          if (blockedLines.has(line)) return false;
          if (/^(点赞|收藏|转发|分享|评论|更多|举报)$/.test(line)) return false;
          if (/^共\s*\d+\s*条评论$/.test(line)) return false;
          if (/^展开\s*\d+\s*条回复$/.test(line)) return false;
          if (/^\d+\s*(赞|收藏|评论|转发)?$/.test(line)) return false;
          return line.length >= 2;
        })
        .join("\n")
        .trim();
    };
    const findCurrentNoteAnchor = () => {
      const anchors = Array.from(document.querySelectorAll("a[href*='/explore/']"))
        .filter((anchor) => sameCurrentPath(anchor.href));
      const ranked = anchors
        .map((anchor) => {
          const rect = anchor.getBoundingClientRect();
          const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
          const centerPenalty = Math.abs((rect.left + rect.width / 2) - window.innerWidth / 2) * 1000;
          const viewportBonus = rect.top < window.innerHeight && rect.bottom > 0 ? 400_000 : 0;
          return { anchor, score: area + viewportBonus - centerPenalty };
        })
        .sort((a, b) => b.score - a.score);
      return ranked[0]?.anchor || null;
    };
    const currentNoteAnchor = findCurrentNoteAnchor();
    const currentNoteCard = currentNoteAnchor?.closest("section, article, [class*='note-item'], [class*='noteItem'], [class*='feed-card'], [class*='card']") || null;
    const bootstrapTitleNode = first(["#detail-title", ".title", "h1"], currentNoteAnchor?.closest("div, section, article") || document) || first(["#detail-title", ".title", "h1"]);
    const candidateRootSelectors = [
      "#noteContainer",
      ".note-container",
      "[class*='noteContainer']",
      "[class*='note-container']",
      "[class*='detail-container']",
      "[class*='detailContainer']",
      "[class*='overlay']",
      "[class*='modal']",
      "[class*='dialog']",
      "[class*='mask']",
      "[class*='popup']",
    ].join(",");
    let detailRoot = null;
    const titleRect = () => bootstrapTitleNode?.getBoundingClientRect() || null;
    const detailRect = () => detailRoot?.getBoundingClientRect?.() || titleRect();
    const containsLeftMediaForTitle = (node) => {
      const tRect = detailRect();
      if (!node || !tRect) return { score: 0, mediaRect: null, mediaNode: null };
      const mediaNodes = node.querySelectorAll("img, video, [style*='background-image'], [class*='media'], [class*='player'], [class*='video']");
      let best = { score: 0, mediaRect: null, mediaNode: null };
      for (const mediaNode of mediaNodes) {
        if (!(mediaNode instanceof Element) || isIrrelevantNode(mediaNode)) continue;
        const rect = mediaNode.getBoundingClientRect();
        if (rect.width < 160 || rect.height < 160) continue;
        if (rect.right > tRect.left + 40) continue;
        const verticalOverlap = Math.max(0, Math.min(rect.bottom, tRect.bottom) - Math.max(rect.top, tRect.top));
        const area = rect.width * rect.height;
        const overlapBonus = verticalOverlap * 2000;
        const distancePenalty = Math.abs(rect.top - tRect.top) * 300;
        const score = area + overlapBonus - distancePenalty;
        if (score > best.score) best = { score, mediaRect: rect, mediaNode };
      }
      return best;
    };
    const detailScore = (node) => {
      if (!node || !bootstrapTitleNode?.isConnected) return 0;
      const rect = node.getBoundingClientRect();
      if (rect.width < 220 || rect.height < 160) return 0;
      if (rect.left < window.innerWidth * 0.32) return 0;
      if (rect.width > window.innerWidth * 0.58) return 0;
      if (!node.contains(bootstrapTitleNode)) return 0;
      const area = rect.width * rect.height;
      const authorBonus = node.querySelector("a[href*='/user/profile/'], [class*='author'], [class*='user']") ? 450_000 : 0;
      const commentBonus = /评论/.test(node.textContent || "") ? 650_000 : 0;
      const alignBonus = Math.max(0, 400_000 - Math.abs(rect.left - window.innerWidth * 0.43) * 2500);
      return area + authorBonus + commentBonus + alignBonus;
    };
    const findDetailRoot = () => {
      if (!bootstrapTitleNode) return null;
      const ranked = [];
      let current = bootstrapTitleNode.parentElement;
      let depth = 0;
      while (current && depth < 12) {
        const score = detailScore(current);
        if (score > 0) ranked.push({ node: current, score });
        current = current.parentElement;
        depth += 1;
      }
      ranked.sort((a, b) => b.score - a.score);
      if (ranked[0]?.node) return ranked[0].node;
      return currentNoteCard || currentNoteAnchor?.closest("div, section, article") || null;
    };
    const overlayScore = (node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.55 || rect.height < window.innerHeight * 0.55) return 0;
      const leftMedia = containsLeftMediaForTitle(node);
      if (bootstrapTitleNode && !node.contains(bootstrapTitleNode) && leftMedia.score <= 0) return 0;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const centerBonus = Math.max(0, 1_000_000 - Math.abs(centerX - window.innerWidth / 2) * 3000);
      const verticalBonus = Math.max(0, 600_000 - Math.abs(centerY - window.innerHeight / 2) * 2000);
      const fixedBonus = ["fixed", "sticky"].includes(window.getComputedStyle(node).position) ? 500_000 : 0;
      const mediaBonus = hasMedia(node) ? 800_000 : 0;
      const titleBonus = bootstrapTitleNode && node.contains(bootstrapTitleNode) ? 1_200_000 : 0;
      return rect.width * rect.height + centerBonus + verticalBonus + fixedBonus + mediaBonus + titleBonus + leftMedia.score;
    };
    const findActiveOverlay = () => {
      const nodes = Array.from(document.querySelectorAll("div, section, article, aside"));
      const ranked = nodes
        .map((node) => ({ node, score: overlayScore(node) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
      return ranked[0]?.node || null;
    };
    const hasMedia = (node) => {
      if (!node) return false;
      return Boolean(node.querySelector([
        "video",
        "img",
        "[style*='background-image']",
        "[class*='media']",
        "[class*='player']",
        "[class*='video']",
      ].join(",")));
    };
    const rootScore = (node) => {
      const rect = node.getBoundingClientRect();
      const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
      const titleBonus = bootstrapTitleNode && node.contains(bootstrapTitleNode) ? 1_000_000 : 0;
      const mediaBonus = hasMedia(node) ? 1_500_000 : 0;
      const widthBonus = rect.width > window.innerWidth * 0.55 ? 500_000 : 0;
      return area + titleBonus + mediaBonus + widthBonus;
    };
    const findNoteRoot = () => {
      if (currentNoteCard || currentNoteAnchor) {
        const anchorAncestors = [];
        let current = currentNoteCard || currentNoteAnchor;
        let depth = 0;
        while (current && depth < 12) {
          if (current instanceof Element) {
            const rect = current.getBoundingClientRect();
            const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
            const titleBonus = bootstrapTitleNode && current.contains(bootstrapTitleNode) ? 800_000 : 0;
            const mediaBonus = hasMedia(current) ? 1_200_000 : 0;
            anchorAncestors.push({ node: current, score: area + titleBonus + mediaBonus });
          }
          current = current.parentElement;
          depth += 1;
        }
        anchorAncestors.sort((a, b) => b.score - a.score);
        if (anchorAncestors[0]?.node) return anchorAncestors[0].node;
      }
      if (detailRoot) {
        const detailAncestors = [];
        let current = detailRoot;
        let depth = 0;
        while (current && depth < 12) {
          const leftMedia = containsLeftMediaForTitle(current);
          if (hasMedia(current) || leftMedia.score > 0 || current.matches(candidateRootSelectors)) {
            detailAncestors.push({ node: current, leftMediaScore: leftMedia.score });
          }
          current = current.parentElement;
          depth += 1;
        }
        const rankedDetailAncestors = detailAncestors
          .map(({ node, leftMediaScore }) => ({ node, score: rootScore(node) + leftMediaScore * 3 + detailScore(detailRoot) }))
          .sort((a, b) => b.score - a.score);
        if (rankedDetailAncestors[0]?.node) return rankedDetailAncestors[0].node;
      }
      if (bootstrapTitleNode) {
        const ancestors = [];
        let current = bootstrapTitleNode.parentElement;
        let depth = 0;
        while (current && depth < 14) {
          const leftMedia = containsLeftMediaForTitle(current);
          if (current.matches(candidateRootSelectors) || hasMedia(current) || leftMedia.score > 0) {
            ancestors.push({ node: current, leftMediaScore: leftMedia.score });
          }
          current = current.parentElement;
          depth += 1;
        }
        const rankedAncestors = ancestors
          .map(({ node, leftMediaScore }) => ({ node, score: rootScore(node) + leftMediaScore * 2 }))
          .sort((a, b) => b.score - a.score);
        if (rankedAncestors[0]?.node) return rankedAncestors[0].node;
      }

      const candidates = Array.from(document.querySelectorAll(candidateRootSelectors));

      const scored = candidates
        .map((node) => ({ node, score: rootScore(node) }))
        .sort((a, b) => b.score - a.score);
      return scored[0]?.node || document;
    };
    detailRoot = findDetailRoot();
    const activeOverlay = findActiveOverlay();
    const noteRoot = activeOverlay || findNoteRoot();
    const scopedRoot = detailRoot || noteRoot;
    const mediaContainerFor = (mediaNode, root) => {
      if (!mediaNode || !root) return null;
      const tRect = detailRect();
      let current = mediaNode;
      let best = mediaNode;
      let depth = 0;
      while (current?.parentElement && current.parentElement !== root.parentElement && depth < 8) {
        const parent = current.parentElement;
        if (root !== document && !root.contains(parent)) break;
        const rect = parent.getBoundingClientRect();
        if (rect.width < 160 || rect.height < 120) break;
        if (tRect && rect.right > tRect.left + 48) break;
        if (rect.width > window.innerWidth * 0.72) break;
        if (isIrrelevantNode(parent)) break;
        best = parent;
        current = parent;
        depth += 1;
      }
      return best;
    };
    const findMediaFrame = (root) => {
      if (!root) return null;
      const rootRect = root.getBoundingClientRect();
      const tRect = detailRect();
      const leftMedia = containsLeftMediaForTitle(root);
      if (leftMedia.mediaNode) return mediaContainerFor(leftMedia.mediaNode, root) || leftMedia.mediaNode;
      const candidates = [root, ...Array.from(root.querySelectorAll("div, section, article, figure"))];
      const ranked = candidates
        .map((node) => {
          const rect = node.getBoundingClientRect();
          if (node === root && rect.width > window.innerWidth * 0.65) return { node, score: 0 };
          if (rect.width < rootRect.width * 0.22 || rect.height < rootRect.height * 0.35) return { node, score: 0 };
          if (tRect) {
            if (rect.right > tRect.left + 40) return { node, score: 0 };
            if (Math.abs(rect.top - tRect.top) > rootRect.height * 0.45) return { node, score: 0 };
          } else if (rect.left > rootRect.left + rootRect.width * 0.58) {
            return { node, score: 0 };
          }
          const mediaBonus = hasMedia(node) ? 1_200_000 : 0;
          const area = rect.width * rect.height;
          const alignBonus = tRect
            ? Math.max(0, 500_000 - Math.abs(rect.right - tRect.left) * 1500)
            : Math.max(0, 300_000 - Math.abs(rect.left - rootRect.left) * 1200);
          const overlapBonus = tRect ? Math.max(0, Math.min(rect.bottom, tRect.bottom) - Math.max(rect.top, tRect.top)) * 1800 : 0;
          return { node, score: area + mediaBonus + alignBonus + overlapBonus };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
      return ranked[0]?.node || null;
    };
    const mediaFrame = findMediaFrame(noteRoot);
    const getMediaRect = () => {
      const frameRect = mediaFrame?.getBoundingClientRect();
      if (frameRect?.width > 120 && frameRect?.height > 120) return frameRect;
      const tRect = detailRect();
      const rootRect = noteRoot?.getBoundingClientRect?.();
      if (!tRect || !rootRect) return null;
      const left = Math.max(0, rootRect.left);
      const right = Math.min(window.innerWidth, tRect.left - 12);
      const top = Math.max(0, Math.min(rootRect.top, tRect.top - 120));
      const bottom = Math.min(window.innerHeight, Math.max(rootRect.bottom, tRect.bottom + 120));
      if (right - left < 160 || bottom - top < 160) return null;
      return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    };
    const visibleScore = (img) => {
      const rect = img.getBoundingClientRect();
      const width = img.naturalWidth || rect.width || 0;
      const height = img.naturalHeight || rect.height || 0;
      if (width < 160 || height < 120) return 0;
      const area = width * height;
      const inViewportBonus = rect.top < window.innerHeight && rect.bottom > 0 ? 500000 : 0;
      const frameRect = mediaFrame?.getBoundingClientRect();
      const frameBonus = frameRect && rect.left >= frameRect.left - 12 && rect.right <= frameRect.right + 12 && rect.top >= frameRect.top - 12 && rect.bottom <= frameRect.bottom + 12 ? 900000 : 0;
      const leftPaneBonus = rect.left < window.innerWidth * 0.55 ? 300000 : 0;
      const rootBonus = noteRoot.contains(img) ? 700000 : 0;
      return area + inViewportBonus + leftPaneBonus + rootBonus + frameBonus;
    };
    const backgroundScore = (node) => {
      const rect = node.getBoundingClientRect();
      const width = rect.width || 0;
      const height = rect.height || 0;
      if (width < 160 || height < 120) return 0;
      const area = width * height;
      const inViewportBonus = rect.top < window.innerHeight && rect.bottom > 0 ? 500000 : 0;
      const frameRect = mediaFrame?.getBoundingClientRect();
      const frameBonus = frameRect && rect.left >= frameRect.left - 12 && rect.right <= frameRect.right + 12 && rect.top >= frameRect.top - 12 && rect.bottom <= frameRect.bottom + 12 ? 900000 : 0;
      const leftPaneBonus = rect.left < window.innerWidth * 0.55 ? 300000 : 0;
      const rootBonus = noteRoot.contains(node) ? 700000 : 0;
      return area + inViewportBonus + leftPaneBonus + rootBonus + frameBonus;
    };
    const extractMediaUrlFromNode = (node) => {
      if (!node || !(node instanceof Element)) return "";
      if (node.tagName === "IFRAME") {
        try {
          const doc = node.contentDocument || node.contentWindow?.document;
          if (doc) {
            const iframeCandidates = [
              doc.querySelector("img"),
              doc.querySelector("video[poster]"),
              doc.querySelector("[style*='background-image']"),
            ].filter(Boolean);
            for (const candidate of iframeCandidates) {
              const iframeUrl =
                candidate.tagName === "IMG"
                  ? normalizeImageUrl(candidate.currentSrc || candidate.src || candidate.getAttribute("src") || candidate.getAttribute("data-src"))
                  : candidate.tagName === "VIDEO"
                    ? normalizeImageUrl(candidate.getAttribute("poster"))
                    : cssImageUrl(candidate.style?.backgroundImage || window.getComputedStyle(candidate).backgroundImage);
              if (iframeUrl && !isBadImage(iframeUrl)) return iframeUrl;
            }
          }
        } catch {
          // ignore cross-origin iframes
        }
      }
      const directImg = node.tagName === "IMG" ? node : node.querySelector("img");
      const directImgUrl = normalizeImageUrl(
        directImg?.currentSrc ||
        directImg?.getAttribute("src") ||
        directImg?.getAttribute("data-src") ||
        directImg?.getAttribute("data-original") ||
        directImg?.getAttribute("data-lazy-src") ||
        directImg?.getAttribute("data-xhs-img") ||
        urlFromSrcset(directImg?.getAttribute("srcset"))
      );
      if (directImgUrl && !isBadImage(directImgUrl)) return directImgUrl;

      const directVideo = node.tagName === "VIDEO" ? node : node.querySelector("video");
      const posterUrl = normalizeImageUrl(
        directVideo?.getAttribute("poster") ||
        directVideo?.getAttribute("data-poster") ||
        directVideo?.getAttribute("x5-video-poster")
      );
      if (posterUrl && !isBadImage(posterUrl)) return posterUrl;

      const sourceUrl = normalizeImageUrl(
        directVideo?.querySelector("source")?.getAttribute("poster") ||
        directVideo?.querySelector("source")?.getAttribute("src")
      );
      if (sourceUrl && !isBadImage(sourceUrl) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(sourceUrl)) return sourceUrl;

      const directStyleUrl = cssImageUrl(node instanceof HTMLElement ? node.style?.backgroundImage : "");
      if (directStyleUrl && !isBadImage(directStyleUrl)) return directStyleUrl;

      const computedStyleUrl = cssImageUrl(window.getComputedStyle(node).backgroundImage);
      if (computedStyleUrl && !isBadImage(computedStyleUrl)) return computedStyleUrl;

      const descendants = node.querySelectorAll("*");
      for (const child of descendants) {
        const childStyleUrl = cssImageUrl(child instanceof HTMLElement ? child.style?.backgroundImage : "");
        if (childStyleUrl && !isBadImage(childStyleUrl)) return childStyleUrl;
        const childComputedUrl = cssImageUrl(window.getComputedStyle(child).backgroundImage);
        if (childComputedUrl && !isBadImage(childComputedUrl)) return childComputedUrl;
      }
      return "";
    };
    const videoHintText = (node) => {
      if (!node || !(node instanceof Element)) return "";
      return [
        node.className || "",
        node.getAttribute("data-type") || "",
        node.getAttribute("role") || "",
        node.getAttribute("aria-label") || "",
      ].join(" ").toLowerCase();
    };
    const hasVideoPosterAttrs = (node) => {
      if (!node || !(node instanceof Element)) return false;
      return Boolean(
        node.getAttribute("poster") ||
        node.getAttribute("data-poster") ||
        node.getAttribute("x5-video-poster") ||
        node.querySelector("video[poster], video[data-poster], video[x5-video-poster], [poster], [data-poster], [x5-video-poster]")
      );
    };
    const isVideoNote = () => {
      const root = mediaFrame || noteRoot;
      if (!root || !(root instanceof Element)) return false;
      if (root.querySelector("video")) return true;
      if (hasVideoPosterAttrs(root)) return true;
      const rootText = String(root.textContent || "").replace(/\s+/g, " ");
      if (/\b\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}\b/.test(rootText)) return true;
      if (/(倍速|高清|点击播放|播放)/.test(rootText) && hasMedia(root)) return true;
      const videoLikeNode = Array.from(root.querySelectorAll("*")).find((node) => {
        if (!(node instanceof Element) || isIrrelevantNode(node)) return false;
        const hint = videoHintText(node);
        const textHint = String(node.textContent || "").replace(/\s+/g, " ");
        return (/video|player|live-photo|playable/.test(hint) || /\b\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}\b/.test(textHint) || /(倍速|高清|点击播放|播放)/.test(textHint)) && (
          hasVideoPosterAttrs(node) ||
          Boolean(node.querySelector("img")) ||
          Boolean(cssImageUrl(window.getComputedStyle(node).backgroundImage)) ||
          hasMedia(node)
        );
      });
      return Boolean(videoLikeNode);
    };
    const pickVideoThumbnail = () => {
      const root = mediaFrame || noteRoot;
      if (!root || !(root instanceof Element)) return { url: "", source: "video-none", top: [] };
      const candidates = [];
      const pushCandidate = (node, url, source) => {
        if (!url || isBadImage(url) || !node || !(node instanceof Element) || isIrrelevantNode(node)) return;
        const score = viewportMediaScore(node) + 500_000;
        if (score <= 0) return;
        candidates.push({
          url,
          source,
          score,
          tag: node.tagName,
          className: node.className || "",
        });
      };
      const videoRoots = [
        root,
        ...Array.from(root.querySelectorAll("video, [poster], [data-poster], [x5-video-poster], [class*='video'], [class*='player'], [class*='poster'], .media-container")),
      ];
      for (const node of videoRoots) {
        if (!(node instanceof Element) || isIrrelevantNode(node)) continue;
        const hint = videoHintText(node);
        if (node !== root && !/video|player|live-photo|playable|poster/.test(hint) && !hasVideoPosterAttrs(node) && !node.querySelector("video")) continue;

        const directPoster = normalizeImageUrl(
          node.getAttribute("poster") ||
          node.getAttribute("data-poster") ||
          node.getAttribute("x5-video-poster")
        );
        pushCandidate(node, directPoster, "video-attr");

        const directVideo = node.tagName === "VIDEO" ? node : node.querySelector("video");
        const videoPoster = normalizeImageUrl(
          directVideo?.getAttribute("poster") ||
          directVideo?.getAttribute("data-poster") ||
          directVideo?.getAttribute("x5-video-poster")
        );
        pushCandidate(directVideo || node, videoPoster, "video-poster");

        const posterImg = node.tagName === "IMG" ? node : node.querySelector("img");
        const posterImgUrl = normalizeImageUrl(
          posterImg?.currentSrc ||
          posterImg?.getAttribute("src") ||
          posterImg?.getAttribute("data-src") ||
          posterImg?.getAttribute("data-original") ||
          posterImg?.getAttribute("data-lazy-src") ||
          urlFromSrcset(posterImg?.getAttribute("srcset"))
        );
        pushCandidate(posterImg || node, posterImgUrl, "video-img");

        const inlineBg = cssImageUrl(node instanceof HTMLElement ? node.style?.backgroundImage : "");
        pushCandidate(node, inlineBg, "video-inline-bg");

        const computedBg = cssImageUrl(window.getComputedStyle(node).backgroundImage);
        pushCandidate(node, computedBg, "video-bg");
      }
      const ranked = candidates.sort((a, b) => b.score - a.score);
      return {
        url: ranked[0]?.url || "",
        source: ranked[0]?.source || "video-none",
        top: ranked.slice(0, 8),
      };
    };
    const viewportMediaScore = (node) => {
      const rect = node.getBoundingClientRect();
      const frameRect = getMediaRect();
      const width = rect.width || 0;
      const height = rect.height || 0;
      if (frameRect) {
        if (width < frameRect.width * 0.3 || height < frameRect.height * 0.3) return 0;
        if (rect.left < frameRect.left - 12 || rect.right > frameRect.right + 12) return 0;
        if (rect.top < frameRect.top - 12 || rect.bottom > frameRect.bottom + 12) return 0;
      } else {
        if (width < window.innerWidth * 0.18 || height < window.innerHeight * 0.22) return 0;
        if (rect.left > window.innerWidth * 0.58) return 0;
        if (rect.top > window.innerHeight * 0.3) return 0;
      }
      const area = width * height;
      const leftRef = frameRect ? frameRect.left : 0;
      const topRef = frameRect ? frameRect.top : 0;
      const leftBonus = frameRect
        ? Math.max(0, 300_000 - Math.abs(rect.left - leftRef) * 1200)
        : (window.innerWidth * 0.58 - Math.max(rect.left, 0)) * 1000;
      const topBonus = frameRect
        ? Math.max(0, 220_000 - Math.abs(rect.top - topRef) * 900)
        : (window.innerHeight * 0.35 - Math.max(rect.top, 0)) * 800;
      return area + leftBonus + topBonus;
    };
    const pickPointSampleThumbnail = () => {
      const frameRect = getMediaRect();
      const points = frameRect ? [
        [frameRect.left + frameRect.width * 0.25, frameRect.top + frameRect.height * 0.22],
        [frameRect.left + frameRect.width * 0.25, frameRect.top + frameRect.height * 0.5],
        [frameRect.left + frameRect.width * 0.25, frameRect.top + frameRect.height * 0.78],
        [frameRect.left + frameRect.width * 0.5, frameRect.top + frameRect.height * 0.22],
        [frameRect.left + frameRect.width * 0.5, frameRect.top + frameRect.height * 0.5],
        [frameRect.left + frameRect.width * 0.5, frameRect.top + frameRect.height * 0.78],
        [frameRect.left + frameRect.width * 0.75, frameRect.top + frameRect.height * 0.22],
        [frameRect.left + frameRect.width * 0.75, frameRect.top + frameRect.height * 0.5],
        [frameRect.left + frameRect.width * 0.75, frameRect.top + frameRect.height * 0.78],
      ] : [
        [window.innerWidth * 0.22, window.innerHeight * 0.28],
        [window.innerWidth * 0.22, window.innerHeight * 0.45],
        [window.innerWidth * 0.22, window.innerHeight * 0.62],
        [window.innerWidth * 0.30, window.innerHeight * 0.28],
        [window.innerWidth * 0.30, window.innerHeight * 0.45],
        [window.innerWidth * 0.30, window.innerHeight * 0.62],
        [window.innerWidth * 0.38, window.innerHeight * 0.28],
        [window.innerWidth * 0.38, window.innerHeight * 0.45],
        [window.innerWidth * 0.38, window.innerHeight * 0.62],
      ];
      const ranked = [];
      for (const [rawX, rawY] of points) {
        const x = Math.round(rawX);
        const y = Math.round(rawY);
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const stack = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];
        for (const node of stack) {
          if (!(node instanceof Element) || isIrrelevantNode(node)) continue;
          const url = extractMediaUrlFromNode(node);
          if (!url) continue;
          const score = viewportMediaScore(node);
          if (score > 0) ranked.push({ url, score, point: [x, y], tag: node.tagName, className: node.className || "" });
        }
      }
      const best = ranked.sort((a, b) => b.score - a.score);
      return { url: best[0]?.url || "", source: "point-sample", top: best.slice(0, 8) };
    };
    const pickViewportThumbnail = () => {
      const pointSample = pickPointSampleThumbnail();
      if (pointSample.url) return pointSample;

      const searchRoot = mediaFrame || noteRoot || document;
      const imgCandidates = Array.from(searchRoot.querySelectorAll("img"));
      const rankedImages = imgCandidates
        .map((img) => {
          if (isIrrelevantNode(img)) return { url: "", score: 0 };
          const url = normalizeImageUrl(
            img.currentSrc ||
            img.src ||
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-original") ||
            img.getAttribute("data-lazy-src") ||
            urlFromSrcset(img.getAttribute("srcset"))
          );
          return { url, score: viewportMediaScore(img) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedImages[0]?.url) return { url: rankedImages[0].url, source: "viewport-image", top: rankedImages.slice(0, 5) };

      const iframeCandidates = Array.from(searchRoot.querySelectorAll("iframe"));
      const rankedIframes = iframeCandidates
        .map((iframe) => {
          if (isIrrelevantNode(iframe)) return { url: "", score: 0 };
          const url = extractMediaUrlFromNode(iframe);
          return { url, score: viewportMediaScore(iframe) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedIframes[0]?.url) return { url: rankedIframes[0].url, source: "viewport-iframe", top: rankedIframes.slice(0, 5) };

      const videoCandidates = Array.from(searchRoot.querySelectorAll("video"));
      const rankedVideos = videoCandidates
        .map((video) => ({
          url: normalizeImageUrl(video.getAttribute("poster") || video.getAttribute("data-poster") || video.getAttribute("x5-video-poster")),
          score: viewportMediaScore(video),
        }))
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedVideos[0]?.url) return { url: rankedVideos[0].url, source: "viewport-video-poster", top: rankedVideos.slice(0, 5) };

      const bgCandidates = Array.from(searchRoot.querySelectorAll("div, section, article"));
      const rankedBackgrounds = bgCandidates
        .map((node) => {
          if (isIrrelevantNode(node)) return { url: "", score: 0 };
          const inlineUrl = cssImageUrl(node.style?.backgroundImage);
          const computedUrl = inlineUrl || cssImageUrl(window.getComputedStyle(node).backgroundImage);
          return { url: computedUrl, score: viewportMediaScore(node) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedBackgrounds[0]?.url) return { url: rankedBackgrounds[0].url, source: "viewport-background", top: rankedBackgrounds.slice(0, 5) };
      return { url: "", source: "viewport-none", top: [] };
    };
    const pickBackgroundThumbnail = () => {
      const candidates = Array.from(noteRoot.querySelectorAll("div, section, article"));
      const ranked = candidates
        .map((node) => {
          if (isIrrelevantNode(node)) return { url: "", score: 0 };
          const inlineUrl = cssImageUrl(node.style?.backgroundImage);
          const computedUrl = inlineUrl || cssImageUrl(window.getComputedStyle(node).backgroundImage);
          return { url: computedUrl, score: backgroundScore(node) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      return { url: ranked[0]?.url || "", top: ranked.slice(0, 5) };
    };
    const pickScopedThumbnail = (root, sourcePrefix = "scoped") => {
      if (!root || !(root instanceof Element)) return { url: "", source: `${sourcePrefix}-none`, top: [] };
      const imgCandidates = Array.from(root.querySelectorAll("img"));
      const rankedImages = imgCandidates
        .map((img) => {
          if (isIrrelevantNode(img)) return { url: "", score: 0 };
          const url = normalizeImageUrl(
            img.currentSrc ||
            img.src ||
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-original") ||
            img.getAttribute("data-lazy-src") ||
            urlFromSrcset(img.getAttribute("srcset"))
          );
          return { url, score: visibleScore(img), tag: img.tagName, className: img.className || "" };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedImages[0]?.url) return { url: rankedImages[0].url, source: `${sourcePrefix}-image`, top: rankedImages.slice(0, 6) };

      const iframeCandidates = Array.from(root.querySelectorAll("iframe"));
      const rankedIframes = iframeCandidates
        .map((iframe) => {
          if (isIrrelevantNode(iframe)) return { url: "", score: 0 };
          return { url: extractMediaUrlFromNode(iframe), score: visibleScore(iframe), tag: iframe.tagName, className: iframe.className || "" };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedIframes[0]?.url) return { url: rankedIframes[0].url, source: `${sourcePrefix}-iframe`, top: rankedIframes.slice(0, 6) };

      const bgCandidates = Array.from(root.querySelectorAll("div, section, article, figure, span"));
      const rankedBackgrounds = bgCandidates
        .map((node) => {
          if (isIrrelevantNode(node)) return { url: "", score: 0 };
          const inlineUrl = cssImageUrl(node.style?.backgroundImage);
          const computedUrl = inlineUrl || cssImageUrl(window.getComputedStyle(node).backgroundImage);
          return { url: computedUrl, score: backgroundScore(node), tag: node.tagName, className: node.className || "" };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedBackgrounds[0]?.url) return { url: rankedBackgrounds[0].url, source: `${sourcePrefix}-background`, top: rankedBackgrounds.slice(0, 6) };

      return { url: "", source: `${sourcePrefix}-none`, top: [] };
    };
    const pickThumbnail = () => {
      const mediaKind = isVideoNote() ? "video" : "image";
      const debug = {
        mediaKind,
        currentPath,
        currentNoteHref: currentNoteAnchor?.href || "",
        currentNoteCardClass: currentNoteCard?.className || "",
        titleText: bootstrapTitleNode?.textContent?.trim() || "",
        noteRootTag: noteRoot?.tagName || "",
        noteRootClass: noteRoot?.className || "",
        detailRootClass: detailRoot?.className || "",
        activeOverlayClass: activeOverlay?.className || "",
        mediaFrameClass: mediaFrame?.className || "",
      };

      if (mediaKind === "video") {
        const videoThumb = pickVideoThumbnail();
        debug.video = videoThumb;
        if (videoThumb.url && !isBadImage(videoThumb.url)) return { url: videoThumb.url, source: videoThumb.source, debug };
      }

      const scopedThumb = pickScopedThumbnail(detailRoot || currentNoteCard || mediaFrame, "current-note");
      debug.scoped = scopedThumb;
      if (scopedThumb.url && !isBadImage(scopedThumb.url)) return { url: scopedThumb.url, source: scopedThumb.source, debug };

      const viewportThumb = pickViewportThumbnail();
      debug.viewport = viewportThumb;
      if (viewportThumb.url && !isBadImage(viewportThumb.url)) return { url: viewportThumb.url, source: viewportThumb.source, debug };

      const poster = normalizeImageUrl(first([
        "video[poster]",
        ".media-container video[poster]",
        "[class*='media'] video[poster]",
      ], noteRoot)?.getAttribute("poster"));
      debug.poster = poster;
      if (poster && !isBadImage(poster)) return { url: poster, source: "note-video-poster", debug };

      const og = normalizeImageUrl(document.querySelector("meta[property='og:image']")?.content);
      debug.og = og;
      if (og && !isBadImage(og)) return { url: og, source: "og-image", debug };

      const activeSlide = normalizeImageUrl(first([
        ".swiper-slide-active img",
        "[class*='swiper-slide-active'] img",
        "[class*='carousel'] [aria-current='true'] img",
      ], noteRoot)?.currentSrc || first([
        ".swiper-slide-active img",
        "[class*='swiper-slide-active'] img",
        "[class*='carousel'] [aria-current='true'] img",
      ], noteRoot)?.src);
      debug.activeSlide = activeSlide;
      if (activeSlide && !isBadImage(activeSlide)) return { url: activeSlide, source: "note-active-slide", debug };

      const selectors = [
        ".media-container img",
        "[class*='media'] img",
        "[class*='note-slider'] img",
        ".swiper-slide img",
        ".media-container img",
        "[class*='content'] img",
        "img",
      ];
      const candidates = selectors.flatMap((selector) => Array.from(noteRoot.querySelectorAll(selector)));
      const iframeCandidates = Array.from(noteRoot.querySelectorAll("iframe"));
      const ranked = candidates
        .map((img) => {
          if (isIrrelevantNode(img)) return { url: "", score: 0 };
          const url = normalizeImageUrl(img.currentSrc || img.src || img.getAttribute("src") || img.getAttribute("data-src"));
          return { url, score: visibleScore(img) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      const rankedIframes = iframeCandidates
        .map((iframe) => {
          if (isIrrelevantNode(iframe)) return { url: "", score: 0 };
          return { url: extractMediaUrlFromNode(iframe), score: visibleScore(iframe) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (rankedIframes[0]?.url) {
        debug.noteIframes = rankedIframes.slice(0, 5);
        return { url: rankedIframes[0].url, source: "note-iframe", debug };
      }
      debug.noteImages = ranked.slice(0, 5);
      if (ranked[0]?.url) return { url: ranked[0].url, source: "note-image", debug };
      const bgThumb = pickBackgroundThumbnail();
      debug.noteBackgrounds = bgThumb.top;
      if (bgThumb.url && !isBadImage(bgThumb.url)) return { url: bgThumb.url, source: "note-background", debug };
      return { url: "", source: "none", debug };
    };
    const parseCount = (value) => {
      const cleaned = String(value || "").trim();
      if (cleaned.includes("万")) return Math.round((Number.parseFloat(cleaned) || 0) * 10000);
      return Number.parseInt(cleaned.replace(/[^0-9]/g, ""), 10) || 0;
    };
    const cleanText = (value, fallback = "") => {
      const clean = String(value ?? "").replace(/\s+/g, " ").trim();
      return clean && clean !== "null" && clean !== "undefined" ? clean : fallback;
    };
    const pickShareCount = () => {
      const selectors = [
        ".share-count",
        "[class*='share-wrapper'] [class*='count']",
        "[class*='forward-wrapper'] [class*='count']",
        "[class*='repost-wrapper'] [class*='count']",
      ];
      for (const selector of selectors) {
        const value = scopedText([selector], detailRoot) || text(selector);
        const count = parseCount(value);
        if (count) return count;
      }
      const candidateNodes = Array.from((detailRoot || scopedRoot || document).querySelectorAll("span, div, button"))
        .filter((node) => /转发|分享|分享给朋友|转发给|分享至/.test(node.textContent || ""));
      for (const node of candidateNodes) {
        const count = parseCount(node.textContent || "");
        if (count) return count;
      }
      return 0;
    };
    const pickVisibleComments = () => {
      const root = document.querySelector("#noteContainer") || detailRoot || scopedRoot || document;
      const items = Array.from(root.querySelectorAll("[id^='comment-'], .comment-item"));
      const seen = new Set();
      const pickAuthorLink = (item) => {
        const links = Array.from(item.querySelectorAll([
          ".author-wrapper a[href*='/user/profile/']",
          ".author a[href*='/user/profile/']",
          "a.name[href*='/user/profile/']",
          "a[href*='/user/profile/']",
        ].join(",")));
        return links.find((link) => cleanText(link.textContent || "")) || links[0] || null;
      };
      const pickAuthorName = (item, authorLink) => {
        const fromLink = cleanText(authorLink?.textContent || authorLink?.innerText || "");
        if (fromLink) return fromLink;
        return cleanText(
          item.querySelector(".author-wrapper .name, .author .name, .author-wrapper, .author")?.textContent || ""
        );
      };
      return items.map((item) => {
        if (!(item instanceof Element)) return null;
        const commentId = cleanText(item.id || "");
        if (commentId && seen.has(commentId)) return null;
        if (commentId) seen.add(commentId);
        const authorLink = pickAuthorLink(item);
        const contentNode = item.querySelector(".content .note-text, [class*='content'] [class*='note-text'], .content");
        const dateNode = item.querySelector(".date");
        const locationNode = item.querySelector(".location");
        const likeText = item.querySelector(".like .count, [class*='like-wrapper'] .count")?.textContent?.trim() || "";
        const userUrl = authorLink?.href || "";
        const userId = (() => {
          try {
            return new URL(userUrl, window.location.href).pathname.split("/").filter(Boolean).pop() || "";
          } catch {
            return "";
          }
        })();
        const content = normalizeNoteText(contentNode?.innerText || contentNode?.textContent || "");
        if (!content) return null;
        return {
          id: commentId,
          user_id: userId,
          user_name: pickAuthorName(item, authorLink),
          content,
          like_count: likeText === "赞" ? 0 : parseCount(likeText),
          posted_at_text: cleanText(dateNode?.textContent || ""),
          location: cleanText(locationNode?.textContent || ""),
          is_reply: item.classList.contains("comment-item-sub"),
        };
      }).filter(Boolean);
    };
    const scopedText = (selectors, root = scopedRoot) => {
      if (!root) return "";
      for (const selector of selectors) {
        const value = root.querySelector(selector)?.textContent?.trim();
        if (value) return value;
      }
      return "";
    };
    const scriptTextCandidates = () => {
      const idPattern = currentNoteId ? new RegExp(currentNoteId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : null;
      return Array.from(document.scripts)
        .map((script) => script.textContent || "")
        .filter((content) => {
          if (content.length < 80) return false;
          if (idPattern?.test(content)) return true;
          return /note|desc|title|xiaohongshu|小红书/i.test(content);
        });
    };
    const valueFromScriptPattern = (patterns) => {
      for (const content of scriptTextCandidates()) {
        for (const pattern of patterns) {
          const match = content.match(pattern);
          const value = decodeScriptString(match?.[1] || "");
          if (value && value.length >= 2) return value;
        }
      }
      return "";
    };
    const contentFromMeta = () => {
      const metaValue = [
        document.querySelector("meta[name='description']")?.content,
        document.querySelector("meta[property='og:description']")?.content,
        document.querySelector("meta[name='twitter:description']")?.content,
      ].find(Boolean) || "";
      return normalizeNoteText(
        metaValue
          .replace(/\s*-\s*小红书\s*$/i, "")
          .replace(/\s*-\s*Xiaohongshu\s*$/i, "")
      );
    };
    const contentFromJsonLd = () => {
      const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "{}");
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const value = item?.articleBody || item?.description || item?.caption || item?.text;
            const clean = normalizeNoteText(value);
            if (clean) return clean;
          }
        } catch {
          // ignore invalid structured data
        }
      }
      return "";
    };
    const contentFromHydration = () => normalizeNoteText(valueFromScriptPattern([
      /"desc"\s*:\s*"((?:\\.|[^"\\])*)"/,
      /"description"\s*:\s*"((?:\\.|[^"\\])*)"/,
      /"content"\s*:\s*"((?:\\.|[^"\\])*)"/,
      /"noteContent"\s*:\s*"((?:\\.|[^"\\])*)"/,
      /"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/,
    ]));
    const contentCandidateScore = (value) => {
      const clean = String(value || "").trim();
      if (clean.length < 2) return 0;
      let score = clean.length;
      if (/[，。！？；：,.!?]/.test(clean)) score += 80;
      if (clean.includes("\n")) score += Math.min(clean.split("\n").length * 30, 180);
      if (/#/.test(clean)) score += 20;
      if (/编辑于|发布于|共\s*\d+\s*条评论|说点什么|回复/.test(clean)) score -= 180;
      return score;
    };
    const isContentNoiseNode = (node) => {
      if (!(node instanceof Element)) return true;
      return Boolean(node.closest([
        "[id^='comment-']",
        "[class*='comment']",
        "[class*='reply']",
        "[class*='author']",
        "[class*='user']",
        "[class*='avatar']",
        "[class*='input']",
        "[class*='toolbar']",
        "[class*='engage']",
        "[class*='capsule']",
        "[class*='recommend']",
      ].join(",")));
    };
    const bestContentCandidate = (selectors, root, titleText, authorText) => {
      if (!root) return "";
      const candidates = [];
      for (const selector of selectors) {
        root.querySelectorAll(selector).forEach((node) => {
          if (!(node instanceof Element)) return;
          if (isContentNoiseNode(node)) return;
          const value = normalizeNoteText(node.innerText || node.textContent || "", titleText, authorText);
          const score = contentCandidateScore(value);
          if (score > 0) candidates.push({ value, score });
        });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.value || "";
    };
    const extractDetailContent = () => {
      const titleText = bootstrapTitleNode?.textContent?.trim() || "";
      const authorText = scopedText(["[class*='username']", ".author-name", "a[href*='/user/profile/']"], detailRoot) || "";
      const primarySelectors = [
        "#detail-desc",
        "[data-testid*='detail-desc']",
        "[class*='detail-desc']",
        "[class*='detailDesc']",
        "[class*='desc']",
      ];
      const primaryRoot = document.querySelector("#noteContainer") || detailRoot || scopedRoot;
      const primary = bestContentCandidate(primarySelectors, primaryRoot, titleText, authorText);
      if (primary) return primary.slice(0, 2000);
      const structured = contentFromJsonLd() || contentFromHydration() || contentFromMeta();
      if (structured) return normalizeNoteText(structured, titleText, authorText).slice(0, 2000);
      const fallbackSelectors = [
        "[class*='note-content']",
        "[class*='noteContent']",
        "[class*='note-text']",
      ];
      const fallback = bestContentCandidate(fallbackSelectors, detailRoot || scopedRoot, titleText, authorText);
      if (fallback) return fallback.slice(0, 2000);
      const root = detailRoot || scopedRoot;
      if (!root) return "";
      return normalizeNoteText(root.innerText || root.textContent || "", titleText, authorText).slice(0, 2000);
    };
    const title = scopedText(["#detail-title", ".title", "h1"], detailRoot) || bootstrapTitleNode?.textContent?.trim() || document.title;
    const content = extractDetailContent();
    const thumbnailResult = pickThumbnail();
    const thumbnail = thumbnailResult.url || "";
    const debug = {
      thumbnail_source: thumbnailResult.source,
      ...thumbnailResult.debug,
    };
    window.__loom_xhs_debug = debug;

    return {
      title,
      content,
      likes: parseCount(scopedText(["[class*='like-wrapper'] [class*='count']", ".like-count"], detailRoot) || text("[class*='like-wrapper'] [class*='count']") || text(".like-count")),
      collects: parseCount(scopedText(["[class*='collect-wrapper'] [class*='count']", ".collect-count"], detailRoot) || text("[class*='collect-wrapper'] [class*='count']") || text(".collect-count")),
      shares: pickShareCount(),
      comments: parseCount(scopedText(["[class*='chat-wrapper'] [class*='count']", ".comment-count"], detailRoot) || text("[class*='chat-wrapper'] [class*='count']") || text(".comment-count")),
      visible_comments: pickVisibleComments(),
      thumbnail_url: thumbnail,
      author: scopedText(["[class*='username']", ".author-name", "a[href*='/user/profile/']"], detailRoot) || text("[class*='username']") || text(".author-name"),
      debug,
    };
  };
})();
