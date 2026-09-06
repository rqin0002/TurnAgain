import { ref, watch } from 'vue'

const normalizeDraft = (value) => value.trim().replace(/\s+/gu, ' ').slice(0, 100)

/**
 * Keeps the text being edited separate from canonical URL criteria. A router
 * update must not remove the space a user just typed or interrupt IME input.
 */
export function useSearchDraft({ value, onChange }) {
  const draft = ref(value())
  let composing = false

  watch(value, (nextValue) => {
    if (!composing && normalizeDraft(draft.value) !== normalizeDraft(nextValue)) {
      draft.value = nextValue
    }
  })

  const onInput = (event) => {
    draft.value = event.target.value
    if (!composing && !event.isComposing) {
      onChange(draft.value)
    }
  }

  const onCompositionStart = () => {
    composing = true
  }

  const onCompositionEnd = (event) => {
    composing = false
    onInput(event)
  }

  return { draft, onInput, onCompositionStart, onCompositionEnd }
}
