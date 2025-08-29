import { LoggingPlugin } from '../../../plugins/built-in/logging-plugin';
import { MetricsPlugin } from '../../../plugins/built-in/metrics-plugin';

describe('Built-in Plugins', () => {
  describe('Plugin Exports', () => {
    it('should export LoggingPlugin', () => {
      expect(LoggingPlugin).toBeDefined();
      expect(new LoggingPlugin()).toBeInstanceOf(LoggingPlugin);
    });

    it('should export MetricsPlugin', () => {
      expect(MetricsPlugin).toBeDefined();
      expect(new MetricsPlugin()).toBeInstanceOf(MetricsPlugin);
    });
  });

  describe('Plugin Compatibility', () => {
    it('should have compatible plugin interfaces', () => {
      const loggingPlugin = new LoggingPlugin();
      const metricsPlugin = new MetricsPlugin();

      // Check required properties
      expect(loggingPlugin.name).toBeDefined();
      expect(loggingPlugin.version).toBeDefined();
      expect(loggingPlugin.description).toBeDefined();
      expect(typeof loggingPlugin.install).toBe('function');

      expect(metricsPlugin.name).toBeDefined();
      expect(metricsPlugin.version).toBeDefined();
      expect(metricsPlugin.description).toBeDefined();
      expect(typeof metricsPlugin.install).toBe('function');
    });

    it('should have unique plugin names', () => {
      const loggingPlugin = new LoggingPlugin();
      const metricsPlugin = new MetricsPlugin();

      expect(loggingPlugin.name).not.toBe(metricsPlugin.name);
    });
  });
});
