import { defineCustomElement } from 'vue'
import DocPreviewElement from './components/DocPreviewElement.vue'
import 'element-plus/dist/index.css'

const DocPreview = defineCustomElement(DocPreviewElement, {
  shadowRoot: false,
})

customElements.define('doc-preview', DocPreview)

export { DocPreview }
