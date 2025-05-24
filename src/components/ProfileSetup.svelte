<script lang="ts">
  import { profileStore, updateUserProfile } from '../stores/profileStore';

  let userName = '';

  function handleSubmit() {
    if (userName.trim()) {
      updateUserProfile(userName.trim());
    } else {
      alert('Please enter your name.');
    }
  }
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
  <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
    <h1 class="text-2xl font-bold mb-6 text-center text-gray-700">Set Up Your Profile</h1>
    <form on:submit|preventDefault={handleSubmit}>
      <div class="mb-4">
        <label for="userName" class="block text-sm font-medium text-gray-600 mb-1">Name</label>
        <input
          type="text"
          id="userName"
          bind:value={userName}
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter your name"
          required
        />
      </div>
      <button
        type="submit"
        class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition duration-150"
      >
        Save Profile
      </button>
    </form>
  </div>
</div>
