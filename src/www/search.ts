// `vscode` is already requested in viewer.js
//const vscodeApi = (window as any).acquireVsCodeApi(); 

if (typeof vscodeApi === undefined) {
  // acquireVsCodeApi() can be called only once, should be never true, only for code writing and syntax check
  var vscodeApi = (window as any).acquireVsCodeApi();
}

let searchId = 0;

window.addEventListener('load', (event) => {
    const input = document.getElementById("searchinput") as HTMLInputElement;
    if (input) {
        input.oninput = (inputEvent) => {
            if (inputEvent.target) {
                const query = (inputEvent.target as HTMLInputElement).value;
                vscodeApi.postMessage({
                    command: "search",
                    query,
                    searchId
                });
            }
        };
        input.focus();

        searchId = parseInt(input.getAttribute("data-searchId")??'');
        console.log("searchId: ", searchId);
    }
});

window.addEventListener('message', (messageEvent) => {
    const message = messageEvent.data; // The JSON data our extension sent
    if (message.command === "searchResults") {
        const resultsDiv = document.getElementById("results") as HTMLDivElement;
        resultsDiv.textContent = ""; // clear contents

        for (const res of message.results) {
            resultsDiv.insertAdjacentHTML("beforeend", `<p class="result-path">${res.docPath ? res.docPath : res.title}</p>`);
            resultsDiv.insertAdjacentHTML("beforeend", `<a href="${res.url}"><h2>${res.title}</h2></a>`);
            resultsDiv.insertAdjacentHTML("beforeend", `<p class="detail" >${res.content}</p>`);
        }
    } 
    if (message.command === "searchProgress") {
        // update progress display (ex. index)
    }
});