const express=require('express');
const app=express()
const cors=require('cors');
require('dotenv').config();
const port=process.env.PORT || 5000


//middle ware
app.use(cors())
app.use(express.json())

app.get('/',(req,res)=>{
    res.send("business manager is running now");
})

app.listen(port,()=>{
    console.log(`business manager is running port ${port}`)
})