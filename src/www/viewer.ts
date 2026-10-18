import Mark, { MarkOptions } from "mark.js";
 
const vscodeApi = (window as any).acquireVsCodeApi(); // can be called only once per webview

// Note : l10n-dev does'nt export strings from this file... no import of vscode ?

// click handler from vscode markdown preview
// clicking on links should be passed to the extension, to handle opening new documents
document.addEventListener("click", event => {
    if (!event) {
        return;
    }
    let t = event.target;
    for (; t;) {
        const href = (t as HTMLElement).tagName === "A" ? (t as HTMLElement).getAttribute("href") : undefined;
        if ((t as HTMLElement).tagName && "A" === (t as HTMLElement).tagName && href) {
            if (href.startsWith("#")) {
                return;
            }
            const url = new URL(href, "file:///"); // `file:///` is added as base, so href is completely resolved, if is relative
            // won't use the file protocol, just checks http, https and pathname parts
            if ((url.protocol === "http:" || url.protocol === "https:") && !url.pathname.endsWith(".md")) { // check some scheme types, which should open in external browser
                return;
            }                                                                               // but .md files will be resolved by mdoc

            return (vscodeApi.postMessage({
                command: "openLink",
                href,
                title: (t as HTMLElement).textContent
            }),
                event.preventDefault(),
                event.stopPropagation());
        }
        t = (t as HTMLElement).parentNode;
    }
});

window.addEventListener('message', event => {
    const message = event.data; // The JSON data our extension sent
    const handlers = {
        scrollToTop() {
            document.getElementsByTagName('html')[0].scrollTop = 0; // embedded html is scrolled
        },
    };
    const action = handlers[message.command];
    if (action) {
        action(message);
    }
});

window.addEventListener('load', () => {
    const urlCopy = document.getElementById("copy-url");
    if (urlCopy) {
        urlCopy.onclick = (ev) => {
            vscodeApi.postMessage({
                command: "copyUrl"
            });
        };
    }
    const findWidget = new FindWidget();
    globalThis.findWidget = findWidget; // for easier debugging, can be accessed as: globalThis.frames[0].findWidget
    const marker = new Mark(document.getElementById("__markdown-content")!);
    window.addEventListener("keydown", (keyboardEvent) => {
        if (keyboardEvent.key === "Escape") {
            if (findWidget.isOpen) {
                findWidget.close();
            }
        }
        else if ((keyboardEvent.key === "f" || keyboardEvent.key === "F") && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) { // Ctrl+F
            if (!findWidget.isOpen) {
                findWidget.open();
            }
            findWidget.focus();
        }
    });
    findWidget.onInputChanged((type: string, options: AddEventListenerOptions) => findInPage(findWidget, marker, type, options));
});

function findInPage(findWidget: FindWidget, marker: Mark, text: string, options) {
    marker.unmark({
        done() {
            if (text === "") {
                findWidget.setResults([]);
                return;
            }
            const markOptions:MarkOptions = {
                done: numRes => {
                    const results = Array.from(document.querySelectorAll("mark"));
                    findWidget.setResults(results);
                }
            };

            if (options.useRegexp) {
                try {
                    const re = new RegExp(text, options.matchCase ? "gm" : "gmi");
                    marker.markRegExp(re, markOptions);
                }
                catch (err) {
                    findWidget.setResults([]);
                    findWidget.regexpError(err);
                }
            }
            else {
                markOptions.caseSensitive = options.matchCase;
                marker.mark(text, markOptions);
            }
        }
    });

}

class FindWidget {
    rootDiv: HTMLDivElement;
    searchInput: HTMLInputElement;
    resultSpan: HTMLSpanElement;
    optCaseSensitiveIcon: HTMLElement;
    optRegexIcon: HTMLElement;
    prevResultIcon: HTMLElement;
    nextResultIcon: HTMLElement;
    closeIcon: HTMLElement;
    results: HTMLElement[];
    resultIdx: number;
    currentResult: HTMLElement | undefined;
    constructor() {
        // div.#__find
        this.rootDiv = document.createElement("div");
        this.rootDiv.id = "__find";
        this.rootDiv.classList.add("closed");
        // input 
        this.searchInput = document.createElement("input");
        this.searchInput.type = "text";
        this.searchInput.placeholder = vscodeApi.l10n.t("Search expression");
        // span
        this.resultSpan = document.createElement("span");
        this.resultSpan.classList.add("position");
        this.resultSpan.innerHTML = vscodeApi.l10n.t("No Results");
        // icons
        this.optCaseSensitiveIcon = this.createIcon({ icon: "case-sensitive", class: "option case", title: vscodeApi.l10n.t("Match Case") });
        this.optRegexIcon = this.createIcon({ icon: "regex", class: "option regex", title: vscodeApi.l10n.t("Use Regular Expression") });
        this.prevResultIcon = this.createIcon({ icon: "arrow-up", class: "disabled action", title: vscodeApi.l10n.t("Previous match (Shift+Enter)") });
        this.nextResultIcon = this.createIcon({ icon: "arrow-down", class: "disabled action", title: vscodeApi.l10n.t("Next match (Enter)") });
        this.closeIcon = this.createIcon({ icon: "close", class: "action", title: vscodeApi.l10n.t("Close (Escape)") });
        // input > div.input-container 
        const inputDiv = document.createElement("div");
        inputDiv.classList.add("input-container");
        inputDiv.append(this.searchInput, this.optCaseSensitiveIcon, this.optRegexIcon);
        this.rootDiv.append(inputDiv,
            this.resultSpan,
            this.prevResultIcon, this.nextResultIcon, this.closeIcon);
        this.results = [];
        this.resultIdx = 1;
        this.currentResult = undefined;
        this.setup();
    }

    createIcon(options = { icon: "", class: "", title: "" }) {
        const iconElement = document.createElement("i");
        iconElement.title = options.title;
        iconElement.classList.value = options.class;
        iconElement.classList.add("codicon", `codicon-${options.icon}`);
        return iconElement;
    }

    setup() {
        // div.#__find
        const body = document.getElementsByTagName("body")[0]; //.append(this.rootDiv);
        const header = document.getElementById("__header");
        body.appendChild(this.rootDiv);
        header?.after(this.rootDiv);
        //
        this.closeIcon.onclick = (pointerEvent) => {
            this.close();
        };
        //
        this.optRegexIcon.onclick = this.optCaseSensitiveIcon.onclick = (pointerEvent) => {
            (pointerEvent.currentTarget as HTMLElement).classList.toggle("active");
            this.focus();
            this.searchInput.dispatchEvent(new Event("input"));
        };
        this.nextResultIcon.onclick = (pointerEvent) => {
            this.jumpToResult(this.resultIdx + 1);
        };
        this.prevResultIcon.onclick = (pointerEvent) => {
            this.jumpToResult(this.resultIdx - 1);
        };
        this.searchInput.onkeydown = (keyboardEvent) => {
            if (keyboardEvent.key === "Enter") {
                const delta = keyboardEvent.shiftKey ? -1 : 1;
                this.jumpToResult(this.resultIdx + delta);
            }
        };
        this.rootDiv.ontransitionend = (transitionEvent) => {
            if (this.rootDiv.classList.contains("closed")) {
                this.reset();
            }
        };
    }

    get isOpen() {
        return this.rootDiv.classList.contains("open");
    }

    open() {
        const classes = this.rootDiv.classList;
        classes.remove("closed");
        classes.add("open");
    }

    reset() {
        this.searchInput.value = "";
        this.searchInput.dispatchEvent(new Event("input"));
        this.nextResultIcon.classList.add("disabled");
        this.prevResultIcon.classList.add("disabled");
        this.results = [];
        this.jumpToResult(0); // will clear result text
    }

    close() {
        const classes = this.rootDiv.classList;
        classes.add("closed");
        classes.remove("open");
    }

    focus() {
        this.searchInput.focus();
    }

    onInputChanged(listener) {
        this.searchInput.addEventListener("input", (inputEvent) => {
            listener(this.searchInput.value, {
                matchCase: this.optCaseSensitiveIcon.classList.contains("active"),
                useRegexp: this.optRegexIcon.classList.contains("active")
            });
        });
    }

    setResults(results: HTMLElement[]) {
        this.results = results;
        this.rootDiv.classList.remove("error");
        this.jumpToResult(0);
        if (results.length > 1) {
            this.nextResultIcon.classList.remove("disabled");
            this.prevResultIcon.classList.remove("disabled");
        } else {
            this.nextResultIcon.classList.add("disabled");
            this.prevResultIcon.classList.add("disabled");
        }
    }

    jumpToResult(idx: number) {
        if (idx < 0) {
            idx = this.results.length - 1;
        }
        else if (idx >= this.results.length) {
            idx = 0;
        }
        this.resultIdx = idx;
        this.currentResult?.classList.remove("current");
        if (this.results.length > 0) {
            this.currentResult = this.results[idx];
            this.currentResult.scrollIntoView();
            this.currentResult.classList.add("current");
            this.resultSpan.textContent = `${this.resultIdx + 1} of ${this.results.length}`;
        }
        else {
            this.resultSpan.textContent = vscodeApi.l10n.t("No Results");
            this.currentResult = undefined;
        }
    }

    regexpError(err) {
        this.rootDiv.classList.add("error");
    }
}
/*
function acquireVsCodeApi() {
    throw new Error("Function not implemented.");
}
*/

