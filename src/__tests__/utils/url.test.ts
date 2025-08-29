import { SyftBoxURLParser } from '../../utils/url';
import { SyftBoxError, SyftBoxErrorCode } from '../../errors';

describe('SyftBoxURLParser', () => {
  describe('parse', () => {
    it('should parse valid SyftBox URL', () => {
      const url = 'syft://user@example.com/path/to/resource';
      const parsed = SyftBoxURLParser.parse(url);

      expect(parsed).toEqual({
        user: 'user',
        domain: 'example.com',
        path: 'path/to/resource',
      });
    });

    it('should parse URL without path', () => {
      const url = 'syft://user@example.com';
      const parsed = SyftBoxURLParser.parse(url);

      expect(parsed).toEqual({
        user: 'user',
        domain: 'example.com',
        path: '',
      });
    });

    it('should handle URL encoded components', () => {
      const url = 'syft://user%40test@example.com/path%20with%20spaces';
      const parsed = SyftBoxURLParser.parse(url);

      expect(parsed).toEqual({
        user: 'user@test',
        domain: 'example.com',
        path: 'path with spaces',
      });
    });

    it('should throw error for invalid URL format', () => {
      expect(() => {
        SyftBoxURLParser.parse('https://example.com');
      }).toThrow(SyftBoxError);
    });

    it('should throw error for missing user', () => {
      expect(() => {
        SyftBoxURLParser.parse('syft://@example.com');
      }).toThrow(SyftBoxError);
    });

    it('should throw error for missing domain', () => {
      expect(() => {
        SyftBoxURLParser.parse('syft://user@');
      }).toThrow(SyftBoxError);
    });
  });

  describe('stringify', () => {
    it('should stringify valid SyftBoxURL', () => {
      const url = {
        user: 'user',
        domain: 'example.com',
        path: 'path/to/resource',
      };

      const stringified = SyftBoxURLParser.stringify(url);
      expect(stringified).toBe('syft://user@example.com/path%2Fto%2Fresource');
    });

    it('should stringify URL without path', () => {
      const url = {
        user: 'user',
        domain: 'example.com',
        path: '',
      };

      const stringified = SyftBoxURLParser.stringify(url);
      expect(stringified).toBe('syft://user@example.com');
    });

    it('should encode special characters', () => {
      const url = {
        user: 'user@test',
        domain: 'example.com',
        path: 'path with spaces',
      };

      const stringified = SyftBoxURLParser.stringify(url);
      expect(stringified).toBe('syft://user%40test@example.com/path%20with%20spaces');
    });

    it('should throw error for missing user', () => {
      expect(() => {
        SyftBoxURLParser.stringify({
          user: '',
          domain: 'example.com',
          path: '',
        });
      }).toThrow(SyftBoxError);
    });
  });

  describe('validate', () => {
    it('should validate correct URL', () => {
      const url = {
        user: 'user',
        domain: 'example.com',
        path: 'path',
      };

      expect(SyftBoxURLParser.validate(url)).toBe(true);
    });

    it('should invalidate URL with missing user', () => {
      const url = {
        user: '',
        domain: 'example.com',
        path: 'path',
      };

      expect(SyftBoxURLParser.validate(url)).toBe(false);
    });
  });

  describe('joinPath', () => {
    it('should join paths correctly', () => {
      const result = SyftBoxURLParser.joinPath('base', 'path', 'to', 'resource');
      expect(result).toBe('base/path/to/resource');
    });

    it('should handle leading/trailing slashes', () => {
      const result = SyftBoxURLParser.joinPath('/base/', '/path/', '/to/');
      expect(result).toBe('/base/path/to');
    });

    it('should filter empty segments', () => {
      const result = SyftBoxURLParser.joinPath('base', '', 'path', '', 'resource');
      expect(result).toBe('base/path/resource');
    });
  });
});
