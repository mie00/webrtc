// Simple mock for svelte/store
export const writable = jest.fn(() => ({
  subscribe: jest.fn((run) => {
    // Immediately call the subscriber with a default value if needed, or just mock subscribe
    // run({}); // Example: run with empty object
    return jest.fn(); // Return an unsubscribe function
  }),
  set: jest.fn(),
  update: jest.fn(),
  // Add a property to hold a mock default value for 'get' if needed
  _mockDefaultValue: {}
}));

export const derived = jest.fn((stores, callback) => ({
  subscribe: jest.fn((run) => {
    // Mock derived store subscription
    // You might need a more sophisticated mock if your tests depend on derived values
    // run(callback(get(stores))); // Example: run with derived value
    return jest.fn(); // Return an unsubscribe function
  }),
  // Add a property to hold a mock default value for 'get' if needed
  _mockDefaultValue: {}
}));

export const get = jest.fn((store) => {
  // Return a sensible default based on what your code might expect from get()
  // This might need adjustment depending on the test context.
  if (store && store._mockDefaultValue !== undefined) {
    return store._mockDefaultValue;
  }
  // Provide a default structure that might be expected by configStore/streamStore consumers
  return {
    'config-loader': 'client', // Example default from configStore
    'user-name': 'test-user',
    'blur-video': 'no',
    // Add other relevant default keys if needed by tests accessing get(configStore)
  };
});

// Add mocks for any other functions imported from 'svelte/store' if needed by your stores
