# Setting up Google Authentication for PermaVid

PermaVid now requires users to sign in with Google when the application launches. This document explains how to set up your Google OAuth credentials for PermaVid.

## Creating Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials" from the left menu
4. Click on "Create Credentials" and select "OAuth client ID"
5. If this is your first time, you'll need to configure the OAuth consent screen:
   - Set the "User Type" to "External"
   - Fill in the required information (App name, User support email, Developer contact email)
   - Add `/auth/signin` to the authorized domains
   - Save and continue
   - No need to add scopes for basic authentication
   - Add your email as a test user
   - Save and continue to finish the consent screen setup

6. Now, create the OAuth client ID:
   - Set the Application type to "Web application"
   - Give it a name like "PermaVid"
   - Under "Authorized JavaScript origins", add `http://localhost:3000`
   - Under "Authorized redirect URIs", add `http://localhost:3000/api/auth/callback/google`
   - Click "Create"

7. You'll receive a client ID and client secret. Save these values.

## Configuring PermaVid

1. In your PermaVid project folder, open the `.env.local` file
2. Update the following values with your Google OAuth credentials:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=generate-a-random-string-for-this
```

3. To generate a secure random string for NEXTAUTH_SECRET, you can use this command:

```bash
openssl rand -base64 32
```

## Testing the Authentication

1. Start the application in development mode:

```bash
pnpm run dev:tauri
```

2. The application should now redirect to the sign-in page when launched
3. Click "Sign in with Google" and complete the authentication flow
4. After successful authentication, you'll be redirected to the main application

## Production Considerations

For production deployments, consider the following:

1. Verify your OAuth consent screen if you want to allow any Google user to sign in
2. Update the `NEXTAUTH_URL` in the .env.local file to match your production URL
3. Generate a new secure `NEXTAUTH_SECRET` for production
4. Add your production URLs to the authorized origins and redirect URIs in the Google Cloud Console

## Troubleshooting

If you encounter issues with authentication:

1. Check the browser console for errors
2. Ensure your client ID and client secret are correctly set in .env.local
3. Verify that the redirect URIs are correctly configured in the Google Cloud Console
4. Make sure the API is enabled in the Google Cloud Console (Google+ API or Google People API)
5. Check that your OAuth consent screen is properly configured 