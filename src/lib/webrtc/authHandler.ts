import type {
  SolutionNegoMessage,
  ChallengeNegoMessage,
  NegoData,
  TrustedNegoMessage
} from '../../types/negoMessages.js';
// WebRTCClient is globally available from types/global.d.ts
import { getDirectClient } from '../../stores/connectionStore.js';
import { setCidKeys } from '../../stores/cidKeyStore.js';
import { updatePeerProfile } from '../../stores/peerProfileStore.js';
import { verifyLoginJWTFromBase64, authStore } from '../../stores/authStore.js';
import { profileStore } from '../../stores/profileStore.js';
import { get } from 'svelte/store';

// Helper to convert Base64URL string to ArrayBuffer
export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert standard Base64 string to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface SolutionHandlerContext {
  sendNego: (client: WebRTCClient, messageData: NegoData) => void;
  acceptClient: (cid: string, client: WebRTCClient) => void;
}

export function createSolutionHandler(context: SolutionHandlerContext) {
  return async (data: SolutionNegoMessage, cid: string) => {
    console.log("Received solution from", cid, data);
    const client = getDirectClient(cid);

    if (!client) {
      console.error(`Solution from ${cid}: Client not found.`);
      return;
    }

    // 1. Verify original challenge content
    const sentChallenge = client.sentChallengeData;
    if (!sentChallenge) {
      console.error(`Solution from ${cid}: No challenge was recorded for this client.`);
      return;
    }
    // The original challenge sent was a string. data.solution.originalChallenge is 'any'.
    // We need to ensure they match. If originalChallenge could be non-string, stringify consistently.
    const receivedOriginalChallengeString = typeof data.solution.originalChallenge === 'string'
      ? data.solution.originalChallenge
      : JSON.stringify(data.solution.originalChallenge);

    if (sentChallenge !== receivedOriginalChallengeString) {
      console.error(`Solution from ${cid}: Original challenge mismatch. Expected: "${sentChallenge}", Received: "${receivedOriginalChallengeString}"`);
      return;
    }
    console.log(`Solution from ${cid}: Original challenge content verified.`);

    // 2. Verify signature of the challenge
    try {
      const devicePubKeySpkiBuffer = base64UrlToArrayBuffer(data.solution.pubKey);
      const deviceCryptoKey = await crypto.subtle.importKey(
        "spki",
        devicePubKeySpkiBuffer,
        { name: "ECDSA", namedCurve: "P-384" }, // Matches our key generation
        true,
        ["verify"]
      );

      const signatureBuffer = base64ToArrayBuffer(data.solution.signedChallenge);
      // Ensure originalChallengeBuffer is derived exactly as it was for signing by the peer
      const originalChallengeBuffer = new TextEncoder().encode(receivedOriginalChallengeString);

      const isSignatureValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" }, // Hash used by peer when signing (SHA-256 for P-384 keys)
        deviceCryptoKey,
        signatureBuffer,
        originalChallengeBuffer
      );

      if (!isSignatureValid) {
        console.error(`Solution from ${cid}: Device signature verification failed for the challenge.`);
        // Potentially mark client as untrusted or destroy
        return;
      }
      console.log(`Solution from ${cid}: Device signature on challenge verified successfully.`);

    } catch (error) {
      console.error(`Solution from ${cid}: Error during device signature verification:`, error);
      return;
    }
    
    // 3. Verify JWT and consistency of public keys
    try {
      const payload = await verifyLoginJWTFromBase64(data.solution.jwt, data.solution.userPubKey);
      // payload.cstm_dat is the device's public key (SPKI B64URL) from the JWT, authenticated by the server.
      // data.solution.pubKey is the device's public key (SPKI B64URL) used to sign the challenge.
      if (data.solution.pubKey !== payload.cstm_dat) {
        console.error(`Solution from ${cid}: Device public key in solution (${data.solution.pubKey}) does not match device public key in JWT payload (${payload.cstm_dat}).`);
        return;
      }
      console.log(`Solution from ${cid}: JWT verified and device public key matches JWT payload.`);

      // All checks passed
      client.trusted = true; // We now trust this peer
      
      // Store peer's device public key and user public key in the new cidKeyStore
      setCidKeys(cid, data.solution.pubKey, data.solution.userPubKey);
      
      updatePeerProfile(data.solution.userPubKey, { userName: data.profile.userName });
      
      context.sendNego(client, { type: "trusted" } as TrustedNegoMessage); // Cast to ensure type correctness
      context.acceptClient(cid, client);
      
      // Clear the stored challenge to prevent replay
      delete client.sentChallengeData;
      console.log(`Solution from ${cid}: Successfully processed. Stored challenge cleared.`);

    } catch (error) {
      console.error(`Solution from ${cid}: Error during JWT verification or subsequent processing:`, error);
      // If JWT verification fails, the client is not trusted.
    }
  };
}

export interface ChallengeHandlerContext {
  sendNego: (client: WebRTCClient, messageData: NegoData) => void;
  uuidv4: () => string; // Add uuidv4 to the context if sendNego in WebRTCApp relies on it for ID generation
}

export function createChallengeHandler(context: ChallengeHandlerContext) {
  return async (data: ChallengeNegoMessage, cid: string) => {
    console.log("challenge received from", cid, "data:", data.data);
    const authState = authStore.getAuthState();

    if (!authState || !authState.privateKeyJwk || !authState.jwt || !authState.publicKeyJwk) {
      console.warn(`Cannot respond to challenge from ${cid}: User not authenticated or keys/JWT missing.`);
      return;
    }

    const client = getDirectClient(cid);
    if (!client || !client.pc) {
      console.error("Client not found or PC not available for cid:", cid, "cannot send solution.");
      return;
    }

    try {
      const privateKey = await crypto.subtle.importKey(
          "jwk",
          authState.privateKeyJwk,
          { name: "ECDSA", namedCurve: "P-384" },
          true,
          ["sign"]
      );

      const originalChallengeContent = data.data; // From ChallengeNegoMessage
      const challengeString = typeof originalChallengeContent === 'string' ? originalChallengeContent : JSON.stringify(originalChallengeContent);
      const challengeBuffer = new TextEncoder().encode(challengeString);

      const signatureBuffer = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        challengeBuffer
      );
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
      const localProfile = get(profileStore);
      const userPubKeyString = authState.userPubKey; // This is now the base64 URL encoded SPKI string

      if (!userPubKeyString) {
        console.error("Cannot send solution: userPubKey is missing from authState.");
        return;
      }

      const devicePublicKeySpki = await authStore.getDevicePublicKeyAsSpki();
      if (!devicePublicKeySpki) {
        console.error("Cannot send solution: Failed to get device public key as SPKI.");
        return;
      }
    
      const solutionMessage: SolutionNegoMessage = {
        type: "solution",
        // id: context.uuidv4(), // If sendNego doesn't add it, it should be added here or by context.sendNego
        solution: {
          signedChallenge: signatureBase64,
          jwt: authState.jwt,
          pubKey: devicePublicKeySpki, // This is the device's public key (SPKI string)
          userPubKey: userPubKeyString, // This is the user's public key from the auth server (SPKI string)
          originalChallenge: originalChallengeContent
        },
        profile: {
          userName: localProfile.userName || "unknown",
        },
      };
      context.sendNego(client, solutionMessage);
      console.log("Solution sent to", cid);

    } catch (error) {
      console.error("Error processing challenge and sending solution to", cid, ":", error);
    }
  };
}
