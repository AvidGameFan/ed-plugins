// Modifiers At Front Plugin for Easy Diffusion
// Adds a toggle that, when enabled, moves the modifier text (added via the Modifiers panel)
// to the front of the prompt instead of leaving it appended at the end.
// Uses the PLUGINS["TASK_CREATE"] hook (see /ui/media/js/task-manager.js), which fires once per
// render batch with the fully-built request body.

(function () {
    "use strict"

    const SETTING_KEY = "modifiersAtFrontEnabled"

    function isEnabled() {
        return localStorage.getItem(SETTING_KEY) === "true"
    }

    function setEnabled(value) {
        localStorage.setItem(SETTING_KEY, value ? "true" : "false")
    }

    // main.js appends active (non-inactive) modifier tags to the prompt as ", tag1, tag2, ..."
    // before this hook ever sees the request. Rebuild that same suffix so it can be stripped
    // from the end and re-inserted at the front.
    function getActiveTagsSuffix(taskBody) {
        const inactive = new Set(taskBody.inactive_tags || [])
        const activeNames = (taskBody.active_tags || []).filter((name) => !inactive.has(name))
        return activeNames.join(", ")
    }

    function insertToggle() {
        const container = document.querySelector("#editor-inputs-tags-container")
        if (!container) {
            setTimeout(insertToggle, 500)
            return
        }
        if (document.querySelector("#modifiers-at-front-row")) {
            return
        }

        const row = document.createElement("div")
        row.id = "modifiers-at-front-row"
        row.className = "row"

        const checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.id = "modifiers-at-front-checkbox"
        checkbox.checked = isEnabled()
        checkbox.addEventListener("change", () => setEnabled(checkbox.checked))

        const label = document.createElement("label")
        label.htmlFor = "modifiers-at-front-checkbox"
        label.innerText = " Place modifiers at the front of the prompt"

        row.appendChild(checkbox)
        row.appendChild(label)
        container.insertBefore(row, container.firstChild)
    }

    insertToggle()

    PLUGINS["TASK_CREATE"].push(function (event) {
        if (!isEnabled()) {
            return
        }

        const taskBody = event.reqBody
        if (typeof taskBody?.prompt !== "string") {
            return
        }

        const tagsSuffix = getActiveTagsSuffix(taskBody)
        if (tagsSuffix === "") {
            return
        }

        if (taskBody.prompt === tagsSuffix) {
            return // prompt is made up entirely of modifiers already, nothing to reorder
        }

        let basePrompt = taskBody.prompt
        const appendedSuffix = ", " + tagsSuffix
        if (basePrompt.endsWith(appendedSuffix)) {
            basePrompt = basePrompt.slice(0, -appendedSuffix.length)
        }

        taskBody.prompt = basePrompt.trim() === "" ? tagsSuffix : `${tagsSuffix}, ${basePrompt}`

        // task-manager.js invokes this hook with `this` bound to the task that's about to render,
        // so update only that task's on-screen prompt label, not every queued task.
        if (this?.previewPrompt) {
            this.previewPrompt.innerText = taskBody.prompt
        }
    })
})()
