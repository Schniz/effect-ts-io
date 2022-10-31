import * as Entry from "@effect/io/internal/stm/entry"
import type * as TxnId from "@effect/io/internal/stm/txnId"
import type * as Ref from "@effect/io/STM/Ref"
import { pipe } from "@fp-ts/data/Function"
import * as HashMap from "@fp-ts/data/HashMap"
import * as MutableRef from "@fp-ts/data/mutable/MutableRef"

/** @internal */
export type Journal = Map<Ref.Ref<unknown>, Entry.Entry>

/** @internal */
export type Todo = () => unknown

/** @internal */
export type JournalAnalysis = JournalAnalysisInvalid | JournalAnalysisReadWrite | JournalAnalysisReadOnly

/** @internal */
export const JournalAnalysisInvalid = 0 as const

/** @internal */
export type JournalAnalysisInvalid = typeof JournalAnalysisInvalid

/** @internal */
export const JournalAnalysisReadWrite = 1 as const

/** @internal */
export type JournalAnalysisReadWrite = typeof JournalAnalysisReadWrite

/** @internal */
export const JournalAnalysisReadOnly = 2 as const

/** @internal */
export type JournalAnalysisReadOnly = typeof JournalAnalysisReadOnly

const emptyTodoMap: HashMap.HashMap<TxnId.TxnId, Todo> = HashMap.empty()

/** @internal */
export const prepareResetJournal = (journal: Journal): () => unknown => {
  const saved: Journal = new Map()
  for (const entry of journal) {
    saved.set(
      entry[0],
      Entry.copy(entry[1])
    )
  }
  return () => {
    journal.clear()
    for (const entry of saved) {
      journal.set(entry[0], entry[1])
    }
  }
}

/** @internal */
export const commitJournal = (journal: Journal) => {
  for (const entry of journal) {
    Entry.commit(entry[1])
  }
}

/**
 * Analyzes the journal, determining whether it is valid and whether it is
 * read only in a single pass. Note that information on whether the
 * journal is read only will only be accurate if the journal is valid, due
 * to short-circuiting that occurs on an invalid journal.
 *
 * @internal
 */
export const analyzeJournal = (journal: Journal): JournalAnalysis => {
  let val: JournalAnalysis = JournalAnalysisReadOnly
  for (const [, entry] of journal) {
    val = Entry.isInvalid(entry) ? JournalAnalysisInvalid : Entry.isChanged(entry) ? JournalAnalysisReadWrite : val
    if (val === JournalAnalysisInvalid) {
      return val
    }
  }
  return val
}

/** @internal */
export const collectTodos = (journal: Journal): Map<TxnId.TxnId, Todo> => {
  const allTodos: Map<TxnId.TxnId, Todo> = new Map()
  for (const [, entry] of journal) {
    const todos = MutableRef.get(entry.ref.todos)
    for (const todo of todos) {
      allTodos.set(todo[0], todo[1])
    }
    pipe(entry.ref.todos, MutableRef.set(emptyTodoMap))
  }
  return allTodos
}

/** @internal */
export const execTodos = (todos: Map<TxnId.TxnId, Todo>) => {
  for (const todo of todos) {
    todo[1]()
  }
}

/** @internal */
export const addTodo = (
  txnId: TxnId.TxnId,
  journal: Journal,
  todoEffect: Todo
): boolean => {
  let added = false
  for (const [, entry] of journal) {
    const oldTodo = MutableRef.get(entry.ref.todos)
    if (!pipe(oldTodo, HashMap.has(txnId))) {
      const newTodo = pipe(oldTodo, HashMap.set(txnId, todoEffect))
      pipe(entry.ref.todos, MutableRef.set(newTodo))
      added = true
    }
  }
  return added
}

/** @internal */
export const untrackedTodoTargets = (
  oldJournal: Journal,
  newJournal: Journal
): Journal => {
  const untracked: Journal = new Map()
  for (const [ref, entry] of newJournal) {
    if (
      // We already tracked this one
      !oldJournal.has(ref) &&
      // This `TRef` was created in the current transaction, so no need to
      // add any todos to it, because it cannot be modified from the outside
      // until the transaction succeeds; so any todo added to it would never
      // succeed.
      !entry.isNew
    ) {
      untracked.set(ref, entry)
    }
  }
  return untracked
}

/** @internal */
export const isValid = (journal: Journal): boolean => {
  let valid = true
  for (const [, entry] of journal) {
    valid = Entry.isValid(entry)
    if (!valid) {
      return valid
    }
  }
  return valid
}

/** @internal */
export const isInvalid = (journal: Journal): boolean => {
  return !isValid(journal)
}