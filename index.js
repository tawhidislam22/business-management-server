const express = require('express');
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

//middle ware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.PASS_DB}@cluster0.nj1gb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const assetsCollection = client.db('assetManagementDb').collection('assets');
    const userCollection = client.db("assetManagementDb").collection("users")
    const allRequestsCollection = client.db('assetManagementDb').collection('allRequests');
    const teamCollection = client.db('assetManagementDb').collection('myTeam')
    const employeesCollection = client.db('assetManagementDb').collection('employees')
    // token related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '10h'
      });
      res.send({ token })
    })
    //user related api
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next(); // Only call next() if verification is successful
      });
    };


    const verifyHr = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query)
      const isHr = user?.role === 'hr';
      if (!isHr) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }
    app.get('/users/hr/:email',verifyToken,verifyHr, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Unauthorized access' }); // Add return
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'hr';
      }
      res.send({ admin });
    });

    app.get('/users',  async (req, res) => {

      const result = await userCollection.find().toArray()
      res.send(result)
    });
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query); // Corrected this line
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null }); // Add return
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/users/hr/:id',verifyToken,verifyHr,async(req,res)=>{
      const id=req.params.id;
      const filter={_id:new ObjectId(id)}
      const updatedDoc={
        $set:{
          role:'hr'
        }
      }
      const result=await userCollection.updateOne(filter,updatedDoc)
      res.send(result)
    })
    app.delete('/users/:id',verifyToken,verifyHr, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })

    //assets related api
    app.get("/assets", async (req, res) => {
      try {
        const { search = "", type = "all", page = 1, limit = 10 } = req.query;
        const query = {
          name: { $regex: search, $options: "i" }, 
          ...(type !== "all" && { type }), 
        };

        const totalAssets = await assetsCollection.countDocuments(query);
        const assets = await assetsCollection
          .find(query)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .toArray();

        res.json({ assets, totalPages: Math.ceil(totalAssets / limit) });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch assets." });
      }
    });

    // Add a new asset
    app.post("/assets", verifyToken, verifyHr, async (req, res) => {
      try {
        const { name, type, quantity, dateAdded } = req.body;
        if (!name || !type || !quantity || !dateAdded) {
          return res.status(400).json({ error: "All fields are required." });
        }
        const newAsset = {
          name,
          type,
          quantity: parseInt(quantity),
          dateAdded: new Date(dateAdded),
          availability: true,
        };
        const result = await assetsCollection.insertOne(newAsset);
        res.status(201).json({ message: "Asset added successfully.", id: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add asset." });
      }
    });


    // Update an asset
    app.put("/assets/:id",verifyToken,verifyHr, async (req, res) => {
      try {
        const { id } = req.params;
        const { name, type, quantity } = req.body;
        const updates = {
          ...(name && { name }),
          ...(type && { type }),
          ...(quantity && { quantity: parseInt(quantity) }),
        };

        const result = await assetsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updates }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Asset not found." });
        }

        res.json({ message: "Asset updated successfully." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update asset." });
      }
    });



    // Delete an asset
    app.delete("/assets/:id",verifyToken,verifyHr, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await assetsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Asset not found." });
        }
        res.json({ message: "Asset deleted successfully." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete asset." });
      }
    });
    // Get My Assets with Filters
    app.get("/allRequests/:email",verifyToken,verifyHr, async (req, res) => {
      
        const { email } = req.params;
        const { search = "", status = "all", type = "all" } = req.query;

        const query = { userEmail: email };
        if (search) query.name = { $regex: search, $options: "i" }; // Case-insensitive search
        if (status !== "all") query.status = status;
        if (type !== "all") query.type = type;

        const assets = await allRequestsCollection.find(query).toArray();
        res.send(assets);
      
    });
    app.post("/myAssets",verifyToken, async (req, res) => {
      const asset = req.body;
      const result = await allRequestsCollection.insertOne(asset)
      res.send(result)
    })


    // Cancel Asset Request (DELETE)
    app.delete("/allRequests/:email/:assetId",verifyToken, async (req, res) => {
     
        const { email, assetId } = req.params;

        // Find and delete the asset in myAssetsCollection
        const result = await allRequestsCollection.deleteOne({
          _id: new ObjectId(assetId),
          userEmail: email,
          status: "pending", // Ensure only pending requests can be deleted
        });
        res.send(result);
    });




    // Return Asset
    app.put("/allRequests/:email/:assetId/return",verifyToken, async (req, res) => {
      try {
        const { email, assetId } = req.params;

        // Find the asset in the user's assets collection
        const asset = await allRequestsCollection.findOne({
          _id: new ObjectId(assetId),
          userEmail: email,
        });

        if (!asset) {
          return res.status(404).json({ message: "Asset not found." });
        }

        if (asset.type !== "Returnable" || asset.status !== "approved") {
          return res.status(400).json({ message: "This asset cannot be returned." });
        }

        // Update the status in myAssetsCollection to 'returned'
        const updateResult = await allRequestsCollection.updateOne(
          { _id: new ObjectId(assetId) },
          { $set: { status: "returned" } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(500).json({ message: "Failed to update asset status." });
        }

        // Optionally update availability in assetsCollection
        const availabilityUpdate = await allRequestsCollection.updateOne(
          { _id: new ObjectId(assetId) },
          { $set: { availability: true } }
        );

        res.json({ message: "Asset returned successfully." });
      } catch (error) {
        console.error("Error returning asset:", error);
        res.status(500).json({ message: "Failed to return the asset." });
      }
    });
    // request related api
    // Get all asset requests
    app.get("/allRequests", verifyToken, verifyHr, async (req, res) => {
      const { search = "", status = "all", email = "", page = 1, limit = 10 } = req.query;
    
      const query = {};
      if (search) query.name = { $regex: search, $options: "i" };
      if (status !== "all") query.status = status;
      if (email) query.userEmail = email;
    
      const totalRequests = await allRequestsCollection.countDocuments(query);
      const requests = await allRequestsCollection
        .find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .toArray();
    
      res.send({ requests, totalPages: Math.ceil(totalRequests / limit) });
    });

    app.post("/allRequests", verifyToken, async (req, res) => {
      const { name, type, userEmail, userName, requestDate, additionalNote, status, assetId } = req.body;
    
      if (!name || !type || !userEmail || !requestDate || !status || !assetId) {
        return res.status(400).json({ message: "Missing required fields." });
      }
    
      const newRequest = {
        name,
        type,
        userEmail,
        userName,
        requestDate,
        additionalNote,
        status,
        assetId, // Include assetId in the request
      };
    
      const result = await allRequestsCollection.insertOne(newRequest);
      res.send(result);
    });

    app.put("/allRequests/:id/approve",verifyToken,verifyHr, async (req, res) => {
      const { id } = req.params;
    
      try {
        // Find the request by ID
        const request = await allRequestsCollection.findOne({ _id: new ObjectId(id) });
    
        if (!request) {
          return res.status(404).json({ message: "Request not found." });
        }
    
        // Update the request status to 'approved'
        const updateRequestResult = await allRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } }
        );
    
        if (updateRequestResult.matchedCount === 0) {
          return res.status(404).json({ message: "Failed to update the request status." });
        }
    
        // Decrease the asset quantity in assetsCollection
        const updateAssetResult = await assetsCollection.updateOne(
          { _id: new ObjectId(request.assetId) },
          { $inc: { quantity: -1 } }
        );
    
        if (updateAssetResult.matchedCount === 0) {
          // Revert the request status if asset update fails
          await allRequestsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "pending" } }
          );
          return res.status(404).json({ message: "Asset not found or quantity update failed." });
        }
    
        res.json({ message: "Request approved and asset quantity updated successfully." });
      } catch (error) {
        console.error("Error approving request:", error);
        res.status(500).json({ message: "Failed to approve the request." });
      }
    });
    

    // Reject a request
    app.put("/allRequests/:id/reject",verifyToken,verifyHr, async (req, res) => {
      const { id } = req.params;

      try {
        const result = await allRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Request not found." });
        }

        res.json({ message: "Request rejected successfully." });
      } catch (error) {
        console.error("Error rejecting request:", error);
        res.status(500).json({ message: "Failed to reject the request." });
      }
    });

    //team related api
    app.get("/team",verifyToken, async (req, res) => {
      
        const { search = "", role = "all" } = req.query;

        const query = {
          name: { $regex: search, $options: "i" }, // Case-insensitive search
          ...(role !== "all" && { role }), // Filter by role if specified
        };

        const members = await teamCollection.find(query).toArray();
        res.send(members);
      
    });

    // Add a new team member
    app.post("/team",verifyToken, async (req, res) => {
      
        const newMember = req.body;
        const result = await teamCollection.insertOne(newMember);
        res.send(result);
       
    });

    // Update a team member
    app.put("/team/:id",verifyToken, async (req, res) => {
      
        const { id } = req.params;
        const updates = req.body;
        const result = await teamCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updates }
        );
        
      res.send(result);
    });
    
    // POST to add a new employee
    app.post("/employees",verifyToken,verifyHr, async (req, res) => {
      const { name, email, status, department, dob, image } = req.body;

      if (!name || !email || !status || !department || !dob || !image) {
        return res.status(400).json({ message: "All fields are required." });
      }

      const newEmployee = {
        name,
        email,
        status,
        department,
        dob,
        image,
        createdAt: new Date(),
      };

      
        const result = await employeesCollection.insertOne(newEmployee);
        res.send(result);
        
    });



    // Delete a team member
    app.delete("/team/:id",verifyToken, async (req, res) => {
      
        const { id } = req.params;
        const result = await teamCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
        
    });

    // GET all employees with optional filters
    app.get("/employees",verifyToken,verifyHr, async (req, res) => {
      const { search, status, department } = req.query;

      const query = {};
      if (search) query.name = { $regex: search, $options: "i" };
      if (status && status !== "all") query.status = status;
      if (department) query.department = department;
        const employees = await employeesCollection.find(query).toArray();
        res.send(employees);
    });

    // DELETE an employee
    app.delete("/employees/:id",verifyToken,verifyHr, async (req, res) => {
      const { id } = req.params;

      
      const result = await employeesCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send("business manager is running now");
})

app.listen(port, () => {
  console.log(`business manager is running port ${port}`)
})