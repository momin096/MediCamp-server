

require("dotenv").config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { MongoClient, ServerApiVersion } = require('mongodb');


const app = express();
const port = process.env.PORT || 5000;


// Middleware
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tp3bo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        const db = client.db('MediCamp')

        const usersCollection = db.collection('users');
        const campsCollection = db.collection('camps');

        // generate json web token 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECRET_KEY, { expiresIn: '1h' });
            res.send({ token });
        })

        // users related apis --------------------------------------------
        app.post('/users/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email }
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                return res.send(isExist)
            }
            const result = await usersCollection.insertOne({
                ...user,
                role: 'Participant',
            })
            res.send(result)
        })



        // ADMIN APIS 
        // add a camp 
        app.post('/camps', async (req, res) => {
            const campDetails = req.body
            const result = await campsCollection.insertOne(campDetails)
            res.send(result)
        })

        // get all camps
        app.get('/camps', async (req, res) => {
            const result = await campsCollection.find().toArray()
            res.send(result)
        })





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
    res.send('Boss Is Running!')
})

app.listen(port, () => {
    console.log(`Boss is running on port: ${port}`)
})