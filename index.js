const express = require('express');
const app = express()
const cors = require('cors');
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
    const allRequestsCollection = client.db('assetManagementDb').collection('allRequests');
    const teamCollection = client.db('assetManagementDb').collection('myTeam')
    const employeesCollection = client.db('assetManagementDb').collection('employees')
    //assets related api
    app.get("/assets", async (req, res) => {
      try {
        const { search = "", type = "all", page = 1, limit = 10 } = req.query;
        const query = {
          name: { $regex: search, $options: "i" }, // Case-insensitive search
          ...(type !== "all" && { type }), // Filter by type if specified
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
    app.post("/assets", async (req, res) => {
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
    app.put("/assets/:id", async (req, res) => {
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
    app.delete("/assets/:id", async (req, res) => {
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
    app.get("/allRequests/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const { search = "", status = "all", type = "all" } = req.query;

        const query = { userEmail: email };
        if (search) query.name = { $regex: search, $options: "i" }; // Case-insensitive search
        if (status !== "all") query.status = status;
        if (type !== "all") query.type = type;

        const assets = await allRequestsCollection.find(query).toArray();
        res.json(assets);
      } catch (error) {
        console.error("Error fetching user assets:", error);
        res.status(500).json({ message: "Failed to fetch user assets." });
      }
    });
    app.post("/myAssets", async (req, res) => {
      const asset = req.body;
      const result = await allRequestsCollection.insertOne(asset)
      res.send(result)
    })


    // Cancel Asset Request (DELETE)
    app.delete("/allRequests/:email/:assetId", async (req, res) => {
      try {
        const { email, assetId } = req.params;

        // Find and delete the asset in myAssetsCollection
        const result = await allRequestsCollection.deleteOne({
          _id: new ObjectId(assetId),
          userEmail: email,
          status: "pending", // Ensure only pending requests can be deleted
        });

        if (result.deletedCount === 0) {
          return res
            .status(400)
            .json({ message: "Failed to cancel the request. It might not exist or is not pending." });
        }

        res.json({ message: "Asset request canceled successfully." });
      } catch (error) {
        console.error("Error canceling request:", error);
        res.status(500).json({ message: "Failed to cancel the request." });
      }
    });




    // Return Asset
    app.put("/allRequests/:email/:assetId/return", async (req, res) => {
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
    app.get("/allRequests", async (req, res) => {
      try {
        const { search = "", status = "all", email = "" } = req.query;

        const query = {};
        if (search) query.name = { $regex: search, $options: "i" }; // Search by name
        if (status !== "all") query.status = status; // Filter by status
        if (email) query.userEmail = email; // Filter by user email

        const requests = await allRequestsCollection.find(query).toArray();
        res.json(requests);
      } catch (error) {
        console.error("Error fetching requests:", error);
        res.status(500).json({ message: "Failed to fetch requests." });
      }
    });

    app.post("/allRequests", async (req, res) => {
      const { name, type, userEmail, userName, requestDate, additionalNote, status } = req.body;

      if (!name || !type || !userEmail || !requestDate || !status) {
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
      };

      try {
        const result = await allRequestsCollection.insertOne(newRequest);
        res.status(201).json({ message: "Request created successfully", requestId: result.insertedId });
      } catch (error) {
        console.error("Error creating request:", error);
        res.status(500).json({ message: "Failed to create request." });
      }
    });

    // Approve a request
    app.put("/allRequests/:id/approve", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await allRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Request not found." });
        }

        res.json({ message: "Request approved successfully." });
      } catch (error) {
        console.error("Error approving request:", error);
        res.status(500).json({ message: "Failed to approve the request." });
      }
    });

    // Reject a request
    app.put("/allRequests/:id/reject", async (req, res) => {
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
    app.get("/team", async (req, res) => {
      try {
        const { search = "", role = "all" } = req.query;

        const query = {
          name: { $regex: search, $options: "i" }, // Case-insensitive search
          ...(role !== "all" && { role }), // Filter by role if specified
        };

        const members = await teamCollection.find(query).toArray();
        res.json(members);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch team members." });
      }
    });

    // Add a new team member
    app.post("/team", async (req, res) => {
      try {
        const newMember = req.body;
        const result = await teamCollection.insertOne(newMember);
        res.status(201).json({ message: "Team member added successfully.", id: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add team member." });
      }
    });

    // Update a team member
    app.put("/team/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        const result = await teamCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updates }
        );
        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Team member not found." });
        }
        res.json({ message: "Team member updated successfully." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update team member." });
      }
    });

    // Delete a team member
    app.delete("/team/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await teamCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Team member not found." });
        }
        res.json({ message: "Team member deleted successfully." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete team member." });
      }
    });

    // GET all employees with optional filters
    app.get("/employees", async (req, res) => {
      const { search, status, department } = req.query;

      const query = {};
      if (search) query.name = { $regex: search, $options: "i" }; // Search by name
      if (status && status !== "all") query.status = status;
      if (department) query.department = department;

      try {
        const employees = await employeesCollection.find(query).toArray();
        res.json(employees);
      } catch (error) {
        console.error("Error fetching employees:", error);
        res.status(500).json({ message: "Failed to fetch employees." });
      }
    });

    // DELETE an employee
    app.delete("/employees/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await employeesCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Employee not found." });
        }

        res.json({ message: "Employee deleted successfully." });
      } catch (error) {
        console.error("Error deleting employee:", error);
        res.status(500).json({ message: "Failed to delete the employee." });
      }
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