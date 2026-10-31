import { powerUpDefinitionSchema, type PowerUpDefinition } from '@monopoly/shared';

/** Freeze parsed copies, including nested serializable contract data. */
function freezeDefinition<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDefinition(child);
    Object.freeze(value);
  }
  return value;
}

/** The default parser preserves Phase 02 fixture support; official catalogs supply their strict schema. */
export class PowerUpRegistry<TDefinition extends PowerUpDefinition = PowerUpDefinition> {
  readonly #definitions = new Map<string, TDefinition>();

  constructor(
    definitions: readonly NoInfer<TDefinition>[],
    ...schema: PowerUpDefinition extends TDefinition
      ? [schema?: { parse(input: unknown): TDefinition }]
      : [schema: { parse(input: unknown): TDefinition }]
  ) {
    for (const input of definitions) {
      // Extended definitions require their parser; the default branch is only available for the base type.
      const definition = freezeDefinition((schema[0] ?? powerUpDefinitionSchema).parse(input)) as TDefinition;
      if (this.#definitions.has(definition.definitionId)) throw new Error('Duplicate power-up definition');
      this.#definitions.set(definition.definitionId, definition);
    }
    Object.freeze(this);
  }

  list(): readonly TDefinition[] {
    return Object.freeze([...this.#definitions.values()]);
  }

  get(definitionId: string): TDefinition {
    const definition = this.#definitions.get(definitionId);
    if (!definition) throw new Error('Unknown power-up definition');
    return definition;
  }
}
