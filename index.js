const express = require('express');
const app = express()
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion } = require('mongodb');

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
    const myAssetsCollection = client.db('assetManagementDb').collection('myAssets');
    //assets related api
    app.get('/assets', async (req, res) => {
      let result = null
      if (req.query) {
        const { search, page = 1, limit = 10 } = req.query;

        // Build the query object based on parameters
        const query = {
          ...(search ? { title: { $regex: search, $options: 'i' } } : {}), // Case-insensitive search
          // Filter by email if provided
        };
        const skip = (page - 1) * limit;
        result = await assetsCollection.find(query).sort({ deadline: 1 }).skip(skip).limit(parseInt(limit)).toArray()
        const total = await assetsCollection.countDocuments(query);

        // Fetch posts from the database with filters, sorting, and pagination
        res.status(200).json({
          assets: result,
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
        });
      }
      else {
        result = await volunteersCollection.find().sort().toArray()
        res.send(result)
      }

    })

    // Get My Assets with Filters
    app.get("/myAssets/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const { search = "", status = "all", type = "all" } = req.query;

        const query = { userEmail: email };
        if (search) query.name = { $regex: search, $options: "i" }; // Case-insensitive search
        if (status !== "all") query.status = status;
        if (type !== "all") query.type = type;

        const assets = await myAssetsCollection.find(query).toArray();
        res.json(assets);
      } catch (error) {
        console.error("Error fetching user assets:", error);
        res.status(500).json({ message: "Failed to fetch user assets." });
      }
    });

    // Cancel Asset Request
    app.put("/myAssets/:email/:assetId", async (req, res) => {
      try {
        const { email, assetId } = req.params;

        const asset = await myAssetsCollection.findOne({
          _id: new ObjectId(assetId),
          userEmail: email,
        });
        if (!asset) {
          return res.status(404).json({ message: "Asset not found." });
        }

        if (asset.status !== "pending") {
          return res
            .status(400)
            .json({ message: "Only pending requests can be canceled." });
        }

        await assetsCollection.updateOne(
          { _id: new ObjectId(assetId) },
          { $set: { status: "canceled" } }
        );

        res.json({ message: "Asset request canceled successfully." });
      } catch (error) {
        console.error("Error canceling request:", error);
        res.status(500).json({ message: "Failed to cancel the request." });
      }
    });

    // Return Asset
    app.put("/myAssets/:email/:assetId/return", async (req, res) => {
      try {
        const { email, assetId } = req.params;

        const asset = await myAssetsCollection.findOne({
          _id: new ObjectId(assetId),
          userEmail: email,
        });
        if (!asset) {
          return res.status(404).json({ message: "Asset not found." });
        }

        if (asset.type !== "returnable" || asset.status !== "approved") {
          return res
            .status(400)
            .json({ message: "This asset cannot be returned." });
        }

        await assetsCollection.updateOne(
          { _id: new ObjectId(assetId) },
          { $set: { status: "returned", availability: true } }
        );

        res.json({ message: "Asset returned successfully." });
      } catch (error) {
        console.error("Error returning asset:", error);
        res.status(500).json({ message: "Failed to return the asset." });
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