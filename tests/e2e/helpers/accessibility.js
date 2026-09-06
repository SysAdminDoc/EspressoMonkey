import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Every exception must name one exact rule/target pair and carry a review
// reason. Keep this list empty when the shipped surface can be fixed instead.
export const reviewedAccessibilityExceptions = Object.freeze([]);

function nodeKey(ruleId, target) {
  return `${ruleId}|${target.join(' > ')}`;
}

export async function analyzeAccessibility(page, label) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const exceptions = new Map(reviewedAccessibilityExceptions.map(exception => [
    nodeKey(exception.ruleId, exception.target),
    exception,
  ]));
  const unexpected = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const key = nodeKey(violation.id, node.target);
      if (!exceptions.has(key)) {
        unexpected.push({
          label,
          rule: violation.id,
          impact: violation.impact,
          target: node.target,
          summary: node.failureSummary,
        });
      }
    }
  }
  return unexpected;
}

export function formatAccessibilityFailures(failures) {
  const grouped = new Map();
  for (const failure of failures) {
    const key = `${failure.impact}|${failure.rule}|${failure.target.join(' > ')}|${failure.summary}`;
    const entry = grouped.get(key) || { ...failure, labels: [] };
    entry.labels.push(failure.label);
    grouped.set(key, entry);
  }
  return [...grouped.values()].map(failure => [
    `[${failure.labels.join(', ')}] ${failure.impact || 'unknown'} ${failure.rule}`,
    `target: ${failure.target.join(' > ')}`,
    failure.summary,
  ].join('\n')).join('\n\n');
}

export async function inspectInteractiveGeometry(page) {
  return page.evaluate(() => {
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'summary',
      '[role="button"]',
      '[role="tab"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const visible = element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      for (let current = element; current instanceof Element; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (
          current.hidden ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity || 1) <= 0
        ) {
          return false;
        }

        const currentRect = current.getBoundingClientRect();
        const clipsToNothing =
          (style.clip !== 'auto' || style.clipPath !== 'none') &&
          (currentRect.width <= 1 || currentRect.height <= 1);
        if (clipsToNothing) return false;
      }

      return true;
    };
    const identify = element => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      if (element.classList.length) {
        return `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).map(name => CSS.escape(name)).join('.')}`;
      }
      if (element instanceof HTMLAnchorElement) return `a[href=${JSON.stringify(element.getAttribute('href') || '')}]`;
      return element.tagName.toLowerCase();
    };
    const targets = [...document.querySelectorAll(focusableSelector)].filter(visible);
    const undersized = [];
    const focusFailures = [];
    const obscured = [];

    for (const element of targets) {
      const targetElement = element.closest('label') || element;
      const targetRect = targetElement.getBoundingClientRect();
      if (targetRect.width < 24 || targetRect.height < 24) {
        undersized.push({ target: identify(element), width: Math.round(targetRect.width * 10) / 10, height: Math.round(targetRect.height * 10) / 10 });
      }
      element.focus({ preventScroll: true });
      if (document.activeElement !== element) {
        focusFailures.push({ target: identify(element), reason: 'did not receive focus' });
        continue;
      }
      const style = getComputedStyle(element);
      const hasOwnIndicator = (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none') || style.boxShadow !== 'none';
      const sibling = element.nextElementSibling;
      const siblingStyle = sibling ? getComputedStyle(sibling) : null;
      const hasSiblingIndicator = siblingStyle && ((parseFloat(siblingStyle.outlineWidth) > 0 && siblingStyle.outlineStyle !== 'none') || siblingStyle.boxShadow !== 'none');
      if (!hasOwnIndicator && !hasSiblingIndicator) {
        focusFailures.push({ target: identify(element), reason: 'no visible outline or shadow' });
      }

      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const focusedRect = element.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, focusedRect.left + focusedRect.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, focusedRect.top + focusedRect.height / 2));
      const hit = document.elementFromPoint(x, y);
      const viewportTolerance = 0.5;
      if (
        focusedRect.top < -viewportTolerance || focusedRect.bottom > innerHeight + viewportTolerance ||
        focusedRect.left < -viewportTolerance || focusedRect.right > innerWidth + viewportTolerance ||
        !hit || (!element.contains(hit) && !hit.contains(element))
      ) {
        obscured.push({ target: identify(element), rect: {
          left: Math.round(focusedRect.left), top: Math.round(focusedRect.top),
          right: Math.round(focusedRect.right), bottom: Math.round(focusedRect.bottom),
        }, hit: hit ? identify(hit) : null });
      }
    }
    return { count: targets.length, undersized, focusFailures, obscured };
  });
}
