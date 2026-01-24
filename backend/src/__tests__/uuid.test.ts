import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

describe('UUID Operations', () => {
  describe('UUID Generation', () => {
    it('should generate a valid v4 UUID', () => {
      const id = uuidv4();
      expect(uuidValidate(id)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(uuidv4());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate UUID in correct format', () => {
      const id = uuidv4();
      const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(pattern.test(id)).toBe(true);
    });

    it('should have version 4 indicator', () => {
      const id = uuidv4();
      expect(id[14]).toBe('4');
    });
  });

  describe('UUID Validation', () => {
    it('should validate correct UUID', () => {
      expect(uuidValidate('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(uuidValidate('not-a-uuid')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(uuidValidate('')).toBe(false);
    });

    it('should reject UUID with wrong length', () => {
      expect(uuidValidate('123e4567-e89b-12d3-a456')).toBe(false);
    });

    it('should reject UUID with invalid characters', () => {
      expect(uuidValidate('123e4567-e89b-12d3-a456-42661417400g')).toBe(false);
    });
  });
});
