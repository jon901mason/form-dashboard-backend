# Form Submission Dashboard - Backend

A centralized dashboard for managing form submissions from WordPress sites across multiple clients.

## Features
- User authentication with JWT
- WordPress client management
- Automatic form discovery (Gravity Forms, Contact Form 7, Elementor)
- Submission storage and retrieval
- CSV export ready

## Local Setup

### Prerequisites
- Node.js 14+
- PostgreSQL 12+

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Update `.env` with your database credentials:
```
DATABASE_URL=postgresql://user:password@localhost:5432/form_dashboard
JWT_SECRET=your_secure_secret_key
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
```

5. Initialize the database:
```bash
npm run migrate
```

6. Start the development server:
```bash
npm run dev
```

Server will run on http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - Login user

### Clients
- `GET /api/clients` - List all clients
- `POST /api/clients` - Add new client
- `GET /api/clients/:id` - Get client details

### Forms
- `POST /api/forms/discover/:clientId` - Discover forms from WordPress site
- `GET /api/forms/client/:clientId` - Get forms for a client
- `GET /api/forms/:formId/submissions` - Get submissions for a form

## Deployment to Railway

1. Install Railway CLI: https://docs.railway.app/getting-started
2. Login: `railway login`
3. Link your project: `railway init`
4. Deploy: `railway up`

Your backend will be live with auto-provisioned PostgreSQL.

## Database Schema

- **users** - Team members
- **clients** - WordPress sites
- **forms** - Forms discovered from WordPress
- **submissions** - Form responses
