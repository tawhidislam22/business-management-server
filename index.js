const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 5000
const jwt = require('jsonwebtoken')
const Stripe = require('stripe')
require('dotenv').config()
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion } = require('mongodb')

// Configure CORS with specific origins
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())

const uri = "mongodb+srv://assetMaster:uWtoDWa0uGz2HEg2@cluster0.nj1gb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
})

// Create Stripe instance
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Verify JWT middleware
// const verifyToken = (req, res, next) => {
//   const token = req?.cookies?.token
//   if (!token) {
//     return res.status(401).send({ message: 'unauthorized access' })
//   }
//   jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//     if (err) {
//       return res.status(403).send({ message: 'unauthorized user' })
//     }
//     req.user = decoded
//     next()
//   })
// }

// Verify HR middleware
const verifyHR = async (req, res, next) => {
  const email = req.user.email
  const query = { email: email }
  const user = await usersCollection.findOne(query)
  const isHR = user?.role === 'hr'
  if (!isHR) {
    return res.status(403).send({ message: 'Forbidden access' })
  }
  next()
}
// Verify Employee middleware
const verifyEmployee = async (req, res, next) => {
  const email = req.user.email
  const query = { email: email }
  const user = await usersCollection.findOne(query)
  const isEmployee = user?.role === 'employee'
}
async function run() {
  try {
    // Connect the client to the server
    await client.connect()
    
    // Get database collections
    const db = client.db('assetManagementDb')
    const usersCollection = db.collection('users')
    const assetsCollection = db.collection('assets')
    const allRequestsCollection = db.collection('allRequests')
    const myAssetsCollection = db.collection('myAssets')
    const employeesCollection = db.collection('employees')

    // JWT related APIs
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '6h' })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true })
    })

    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true })
    })
    // Dashboard related APIs
    app.get('/dashboard/hr-stats', verifyHR, async (req, res) => {
      const email = req.user.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      res.send(user)
    })
    app.get('/dashboard/employee-stats', verifyEmployee, async (req, res) => {
      const email = req.user.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      res.send(user)
    })
    // User related APIs
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      res.send({ role: user?.role || null })
    })

    app.post('/users', async (req, res) => {
      const user = req.body
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null })
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      res.send(user)
    })
    // Asset related APIs
    app.get('/assets', async (req, res) => {
      const result = await assetsCollection.find().toArray()
      res.send(result)
    })
    app.get('/assets/:email', async (req, res) => {
      const email = req.params.email;
      const { search, type, availability, sort } = req.query;
    
      // Start with filtering by hrEmail
      let query = { hrEmail: email };
    
      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }
    
      if (type) {
        query.type = type;
      }
    
      if (availability) {
        query.quantity = availability === 'available' ? { $gt: 0 } : { $eq: 0 };
      }
    
      const options = {
        sort: sort === 'asc' ? { quantity: 1 } : sort === 'desc' ? { quantity: -1 } : {}
      };
    
      try {
        const result = await assetsCollection.find(query, options).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error' });
      }
    });
    

    app.post('/assets',  async (req, res) => {
      const asset = req.body
      const result = await assetsCollection.insertOne(asset)
      res.send(result)
    })

    // My Assets related APIs
    //all assets of a user here his company assets he show 
     app.get('/all-assets/:companyName', async (req, res) => {
      const companyName = req.params.companyName
      const query = { companyName: companyName }
      const result = await assetsCollection.find(query).toArray()
      res.send(result)
     }) 
    app.get('/my-assets', async (req, res) => {
      const email = req.query.email
      const query = { userEmail: email }
      const result = await myAssetsCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/my-assets', async (req, res) => {
      const asset = req.body
      const result = await myAssetsCollection.insertOne(asset)
      res.send(result)
    })

    // Request related APIs
  
    app.get('/requests', async (req, res) => {
      const { email, status } = req.query
      let query = {}

      if (email) {
        query.requesterEmail = email
      }

      if (status) {
        query.status = status
      }

      const result = await allRequestsCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/requests', async (req, res) => {
      const request = req.body
      const result = await allRequestsCollection.insertOne(request)

      // Update asset quantity if request is approved
      if (request.status === 'approved') {
        await assetsCollection.updateOne(
          { _id: request.assetId },
          { $inc: { quantity: -1 } }
        )
      }

      res.send(result)
    })
    // Return asset related APIs
    app.put('/requests/:email/:id/return', async (req, res) => {
      const { email, id } = req.params
      const result = await allRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'returned' } }  
      )
      res.send(result)
    })  
    // Cancel request related APIs
    app.put('/requests/:email/:id/cancel', async (req, res) => {
      const { email, id } = req.params
      const result = await allRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'canceled' } }  
      )
      res.send(result)
    })
    // Update request status related APIs
    app.put('/requests/:email/:id/status', async (req, res) => {
      const { email, id } = req.params
      const { status } = req.body
      const result = await allRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }  
      )
      res.send(result)
    })
    
    
    // Employee related APIs
    app.get('/employees', async (req, res) => {
      const result = await employeesCollection.find().toArray()
      res.send(result)
    })

    app.post('/employees', verifyHR, async (req, res) => {
      const employee = req.body
      const result = await employeesCollection.insertOne(employee)
      res.send(result)
    })

    // Test endpoint
    app.get('/', (req, res) => {
      res.send('Asset Management Server is running')
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 })
    console.log("Successfully connected to MongoDB!")

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`)
    })

  } catch (error) {
    console.error("Error connecting to MongoDB:", error)
  }
}

run().catch(console.dir)
