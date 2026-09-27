/* Site interactions: the mobile navigation drawer and the local site search.
 *
 * Kept in one shared file so the four pages can't drift out of sync. The
 * original copy-pasted inline versions had already drifted — they looked for a
 * .hamburger button that didn't exist in the markup, so they threw a
 * TypeError on every page load.
 */
document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    /* =====================================================================
       Mobile navigation drawer
       ===================================================================== */

    var hamburger = document.querySelector('.hamburger');
    var nav = document.getElementById('site-nav');
    var navClose = document.querySelector('.nav-close');
    var backdrop = document.querySelector('.nav-backdrop');

    function navIsOpen() {
        return !!nav && nav.classList.contains('active');
    }

    function setNavOpen(open) {
        if (!hamburger || !nav) {
            return;
        }

        hamburger.classList.toggle('active', open);
        nav.classList.toggle('active', open);
        hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');

        if (backdrop) {
            backdrop.classList.toggle('active', open);
        }

        // Stops the page scrolling behind the open drawer.
        document.body.classList.toggle('nav-open', open);
    }

    if (hamburger && nav) {
        hamburger.addEventListener('click', function () {
            setNavOpen(!navIsOpen());
        });
    }

    if (navClose) {
        navClose.addEventListener('click', function () {
            setNavOpen(false);
            if (hamburger) {
                hamburger.focus();
            }
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', function () {
            setNavOpen(false);
        });
    }

    // Collapse the drawer once a destination has been chosen.
    if (nav) {
        Array.prototype.forEach.call(nav.querySelectorAll('a'), function (link) {
            link.addEventListener('click', function () {
                setNavOpen(false);
            });
        });
    }

    // Rotating a phone or resizing past the breakpoint shouldn't leave the
    // drawer stuck open behind the desktop layout.
    var desktop = window.matchMedia('(min-width: 769px)');
    var resetOnDesktop = function (event) {
        if (event.matches) {
            setNavOpen(false);
        }
    };

    if (desktop.addEventListener) {
        desktop.addEventListener('change', resetOnDesktop);
    } else if (desktop.addListener) {
        desktop.addListener(resetOnDesktop); // Safari < 14
    }

    /* =====================================================================
       Local site search
       ---------------------------------------------------------------------
       Everything is matched in the browser against search-index.js. No
       backend, no cost, no tracking, and it works straight off disk.
       ===================================================================== */

    var dialog = document.getElementById('search-dialog');
    var input = document.getElementById('search-input');
    var results = document.getElementById('search-results');
    var status = document.getElementById('search-status');
    var index = window.SITE_SEARCH_INDEX || [];

    /*
     * Chinese pages set window.SITE_I18N with their own wording for the
     * results summary. Everything falls back to English, so the English
     * pages need no translation block at all.
     */
    var messages = window.SITE_I18N || {};

    function t(key, fallback) {
        return typeof messages[key] === 'string' ? messages[key] : fallback;
    }

    // Fills {n} / {q} style placeholders, leaving unknown ones untouched so a
    // bad translation can never produce a bare "undefined".
    function fill(template, values) {
        return template.replace(/\{(\w+)\}/g, function (whole, name) {
            return Object.prototype.hasOwnProperty.call(values, name)
                ? values[name]
                : whole;
        });
    }

    function termsFor(query) {
        return query.toLowerCase().split(/\s+/).filter(function (term) {
            return term.length > 0;
        });
    }

    // Every term has to match somewhere; a hit in the title counts for more.
    function scoreEntry(entry, terms) {
        var title = entry.title.toLowerCase();
        var text = (entry.text || '').toLowerCase();
        var score = 0;

        for (var i = 0; i < terms.length; i++) {
            var inTitle = title.indexOf(terms[i]) !== -1;
            var inText = text.indexOf(terms[i]) !== -1;

            if (!inTitle && !inText) {
                return 0;
            }

            score += inTitle ? 3 : 1;
        }

        return score;
    }

    function findMatches(query) {
        var terms = termsFor(query);
        if (!terms.length) {
            return { terms: terms, entries: [] };
        }

        var scored = [];
        index.forEach(function (entry) {
            var score = scoreEntry(entry, terms);
            if (score > 0) {
                scored.push({ entry: entry, score: score });
            }
        });

        scored.sort(function (a, b) {
            return b.score - a.score || a.entry.title.localeCompare(b.entry.title);
        });

        return {
            terms: terms,
            entries: scored.map(function (item) {
                return item.entry;
            })
        };
    }

    /*
     * Wraps each matching run of text in <mark> so the match stands out.
     * Builds nodes instead of touching innerHTML, so nothing from the index
     * or from whatever the visitor typed can ever become markup.
     */
    function highlight(text, terms) {
        var lower = text.toLowerCase();
        var ranges = [];

        terms.forEach(function (term) {
            var from = 0;
            var at;
            while ((at = lower.indexOf(term, from)) !== -1) {
                ranges.push([at, at + term.length]);
                from = at + term.length;
            }
        });

        if (!ranges.length) {
            return document.createTextNode(text);
        }

        // Merge overlapping ranges so a <mark> never ends up inside another.
        ranges.sort(function (a, b) {
            return a[0] - b[0];
        });

        var merged = [ranges[0]];
        for (var i = 1; i < ranges.length; i++) {
            var last = merged[merged.length - 1];
            if (ranges[i][0] <= last[1]) {
                last[1] = Math.max(last[1], ranges[i][1]);
            } else {
                merged.push(ranges[i]);
            }
        }

        var fragment = document.createDocumentFragment();
        var cursor = 0;

        merged.forEach(function (range) {
            if (range[0] > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, range[0])));
            }

            var mark = document.createElement('mark');
            mark.textContent = text.slice(range[0], range[1]);
            fragment.appendChild(mark);

            cursor = range[1];
        });

        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }

        return fragment;
    }

    function render(query) {
        if (!results) {
            return;
        }

        results.textContent = '';

        if (!query.trim()) {
            if (status) {
                status.textContent = index.length
                    ? t('hint', 'Search the whole site \u2014 press Esc to close.')
                    : t('indexEmpty', 'The search index is empty.');
            }
            return;
        }

        var found = findMatches(query);

        if (!found.entries.length) {
            if (status) {
                status.textContent = fill(
                    t('noResults', 'No results for \u201c{q}\u201d'),
                    { q: query }
                );
            }
            return;
        }

        if (status) {
            status.textContent = found.entries.length === 1
                ? t('resultsOne', '1 result')
                : fill(t('resultsMany', '{n} results'), { n: found.entries.length });
        }

        found.entries.forEach(function (entry) {
            var item = document.createElement('li');
            var link = document.createElement('a');
            link.href = entry.url;
            link.appendChild(highlight(entry.title, found.terms));
            item.appendChild(link);
            results.appendChild(item);
        });
    }

    function openSearch() {
        if (!dialog) {
            return;
        }

        if (typeof dialog.showModal === 'function') {
            if (!dialog.open) {
                dialog.showModal();
            }
        } else {
            dialog.setAttribute('open', 'open');
        }

        if (input) {
            input.value = '';
            input.focus();
        }

        render('');
    }

    function closeSearch() {
        if (!dialog) {
            return;
        }

        if (typeof dialog.close === 'function') {
            if (dialog.open) {
                dialog.close();
            }
        } else {
            dialog.removeAttribute('open');
        }
    }

    Array.prototype.forEach.call(document.querySelectorAll('.search-toggle'), function (button) {
        button.addEventListener('click', openSearch);
    });

    if (dialog) {
        // A click that lands on the dialog itself, rather than on something
        // inside it, is the dimmed backdrop — treat that as "dismiss".
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                closeSearch();
            }
        });

        dialog.addEventListener('close', function () {
            if (input) {
                input.value = '';
            }
            if (results) {
                results.textContent = '';
            }
            if (status) {
                status.textContent = '';
            }
        });

        var closeButton = dialog.querySelector('.search-close');
        if (closeButton) {
            closeButton.addEventListener('click', closeSearch);
        }
    }

    if (input) {
        input.addEventListener('input', function () {
            render(input.value);
        });

        input.addEventListener('keydown', function (event) {
            // Enter jumps straight to the best match.
            if (event.key === 'Enter') {
                var first = results && results.querySelector('a');
                if (first) {
                    window.location.href = first.getAttribute('href');
                }
            }
        });
    }

    /* =====================================================================
       Keyboard shortcuts
       ===================================================================== */

    document.addEventListener('keydown', function (event) {
        // Ctrl/Cmd+K opens search, the way most sites do it.
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            openSearch();
            return;
        }

        if (event.key !== 'Escape') {
            return;
        }

        /*
         * Close the search dialog first if it's open. Browsers are supposed
         * to do this natively for a modal <dialog>, but that turned out not
         * to fire in every environment, so it's handled here instead of
         * being relied upon.
         */
        if (dialog && dialog.open) {
            event.preventDefault();
            closeSearch();
            return;
        }

        if (navIsOpen()) {
            setNavOpen(false);
            if (hamburger) {
                hamburger.focus();
            }
        }
    });
});
