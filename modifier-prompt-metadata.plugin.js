// Modifier Prompt Metadata Plugin
// Uses prompts embedded in selected Easy Diffusion modifier images instead of their names.
// v1.0.0, last updated 9/25/2026
//
// Free to use with the CMDR2 Stable Diffusion UI.
//
; (function () {
    "use strict"

    const SETTING_KEY = "modifierPromptMetadataEnabled"
    const promptCache = new Map()
    let exifrPromise

    function isEnabled() {
        return localStorage.getItem(SETTING_KEY) === "true"
    }

    function loadExifr() {
        if (window.exifr) {
            return Promise.resolve(window.exifr)
        }
        if (exifrPromise) {
            return exifrPromise
        }

        exifrPromise = new Promise((resolve, reject) => {
            let script = document.querySelector('script[src*="exifr"]')
            let appendScript = false
            if (!script) {
                script = document.createElement("script")
                script.src = "https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.js"
                appendScript = true
            }

            let timeout
            const onLoad = () => {
                clearTimeout(timeout)
                script.removeEventListener("load", onLoad)
                script.removeEventListener("error", onError)
                if (window.exifr) resolve(window.exifr)
                else reject(new Error("exifr did not load"))
            }
            const onError = () => {
                clearTimeout(timeout)
                script.removeEventListener("load", onLoad)
                script.removeEventListener("error", onError)
                reject(new Error("Failed to load exifr"))
            }

            script.addEventListener("load", onLoad, { once: true })
            script.addEventListener("error", onError, { once: true })
            timeout = setTimeout(onError, 10000)
            if (appendScript) document.head.appendChild(script)
        })

        return exifrPromise
    }

    function promptFromText(value) {
        if (typeof value !== "string") return null
        const text = value.trim()
        if (!text) return null

        if (text.startsWith("{")) {
            try {
                const json = JSON.parse(text)
                const nodes = Object.values(json)
                const textNode = nodes.find(node => node?.class_type === "CLIPTextEncode" && node.inputs?.text)
                    || nodes.find(node => node?.inputs?.text)
                if (typeof textNode?.inputs?.text === "string") return textNode.inputs.text.trim() || null
            } catch (_) {}
        }

        return text.split(/\r?\n(?=Negative prompt:|Steps:)/, 1)[0].trim() || null
    }

    function promptFromMetadata(data) {
        if (!data || typeof data !== "object") return null

        for (const key of ["parameters", "ImageDescription", "UserComment", "text"]) {
            const prompt = promptFromText(data[key])
            if (prompt) return prompt
        }

        for (const [key, value] of Object.entries(data)) {
            if (typeof value === "string" && /prompt|description/i.test(key)) {
                const prompt = promptFromText(value)
                if (prompt) return prompt
            }
        }
        return null
    }

    async function extractPromptFromImage(file) {
        const exifr = await loadExifr()
        return promptFromMetadata(await exifr.parse(file))
    }

    window.EasyDiffusionImageMetadata = { extractPromptFromImage }

    function insertToggle() {
        const container = document.querySelector("#editor-inputs-tags-container")
        const tagList = document.querySelector("#editor-inputs-tags-list")
        if (!container || !tagList) {
            setTimeout(insertToggle, 500)
            return
        }
        if (document.querySelector("#modifier-prompt-metadata-row")) return

        const row = document.createElement("div")
        row.id = "modifier-prompt-metadata-row"
        row.className = "row"

        const checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.id = "modifier-prompt-metadata-checkbox"
        checkbox.checked = isEnabled()
        checkbox.addEventListener("change", () => {
            localStorage.setItem(SETTING_KEY, checkbox.checked ? "true" : "false")
        })

        const label = document.createElement("label")
        label.htmlFor = checkbox.id
        label.textContent = " Use prompts embedded in modifier images"
        label.title = "For selected JPG/PNG modifiers with embedded prompt metadata"

        row.append(checkbox, label)
        container.insertBefore(row, tagList)
    }

    function getPreviewUrl(tag) {
        const image = tag?.element?.querySelector(".modifier-card-image")
        const preview = image?.currentSrc || image?.src
        if (preview) return preview
        return Array.isArray(tag?.previews) ? tag.previews[0] : null
    }

    function hasSupportedExtension(url) {
        try {
            return /\.(?:jpe?g|png)$/i.test(new URL(url, window.location.href).pathname)
        } catch (_) {
            return false
        }
    }

    async function getPromptForPreview(url) {
        if (!url || !hasSupportedExtension(url)) return null
        if (!promptCache.has(url)) {
            promptCache.set(url, (async () => {
                const response = await fetch(url)
                if (!response.ok) return null
                return extractPromptFromImage(await response.blob())
            })().catch(error => {
                console.warn("Modifier prompt metadata could not be read:", error)
                return null
            }))
        }
        return promptCache.get(url)
    }

    function getActiveTags(taskBody) {
        const inactive = new Set(taskBody.inactive_tags || [])
        return (taskBody.active_tags || [])
            .filter(name => !inactive.has(name))
            .map(name => {
                const activeTag = typeof activeTags !== "undefined"
                    ? activeTags.find(tag => tag.name === name)
                    : null
                return { name, url: getPreviewUrl(activeTag) }
            })
    }

    async function replaceModifierNames(event) {
        if (!isEnabled()) return

        const taskBody = event.reqBody
        if (typeof taskBody?.prompt !== "string") return

        const tags = getActiveTags(taskBody)
        if (tags.length === 0) return

        const replacementNames = await Promise.all(tags.map(async tag =>
            await getPromptForPreview(tag.url) || tag.name
        ))

        const originalSuffix = tags.map(tag => tag.name).join(", ")
        const replacementSuffix = replacementNames.join(", ")
        let prompt = taskBody.prompt
        const appendedSuffix = ", " + originalSuffix

        if (prompt.endsWith(appendedSuffix)) {
            prompt = prompt.slice(0, -appendedSuffix.length)
            taskBody.prompt = prompt.trim() ? `${prompt}, ${replacementSuffix}` : replacementSuffix
        } else if (prompt === originalSuffix) {
            taskBody.prompt = replacementSuffix
        } else if (prompt.startsWith(originalSuffix + ", ")) {
            taskBody.prompt = `${replacementSuffix}, ${prompt.slice(originalSuffix.length + 2)}`
        } else {
            return
        }

        if (this?.previewPrompt) this.previewPrompt.innerText = taskBody.prompt
    }

    insertToggle()
    PLUGINS["TASK_CREATE"].push(replaceModifierNames)
})()